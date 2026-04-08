// app/routes/app.rates.jsx
//
// When admin saves rates:
//   1. Validates input
//   2. Saves to Prisma
//   3. Mirrors to Shop Metafields (storefront reads these)
//   4. Fetches ALL products + their variants
//   5. Reads per-product metafields: custom.metal_weight_grams,
//      custom.diamond_carat, custom.making_charge
//   6. Calculates new price per variant based on metal/diamond option titles
//   7. Calls productVariantsBulkUpdate for every product
//
// Formula:
//   variant_price = (metal_weight_grams × metal_rate)
//                 + (diamond_carat     × diamond_rate)
//                 + making_charge
//
// Variant option matching (case-insensitive):
//   "Gold 18K" / "18k gold" → gold18k rate
//   "Gold 14K" / "14k gold" → gold14k rate
//   "Gold 9K"  / "9k gold"  → gold9k  rate
//   "Natural"               → diaNat  rate
//   "Lab-grown" / "lab"     → diaLab  rate

import { useEffect, useRef, useState, useCallback } from "react";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const METAFIELD_NAMESPACE = "pfj_pricing";

const FIELDS = [
  {
    key: "gold18k",
    label: "18K Gold",
    unit: "per gram",
    group: "metal",
    metaKey: "gold_18k",
  },
  {
    key: "gold14k",
    label: "14K Gold",
    unit: "per gram",
    group: "metal",
    metaKey: "gold_14k",
  },
  {
    key: "gold9k",
    label: "9K Gold",
    unit: "per gram",
    group: "metal",
    metaKey: "gold_9k",
  },
  {
    key: "diaNat",
    label: "Natural Diamond",
    unit: "per carat",
    group: "diamond",
    metaKey: "dia_nat",
  },
  {
    key: "diaLab",
    label: "Lab Grown Diamond",
    unit: "per carat",
    group: "diamond",
    metaKey: "dia_lab",
  },
];

// ── Match variant option title → rate key ─────────────────────────────────────
function getMetalRate(optionTitle, rates) {
  const t = optionTitle.toLowerCase().replace(/\s/g, "");
  if (t.includes("18k") || t.includes("18c")) return rates.gold18k;
  if (t.includes("14k") || t.includes("14c")) return rates.gold14k;
  if (t.includes("9k") || t.includes("9c")) return rates.gold9k;
  return null; // not a metal option
}

function getDiamondRate(optionTitle, rates) {
  const t = optionTitle.toLowerCase().replace(/\s/g, "");
  if (t.includes("natural") || t.includes("neutral") || t.includes("nat"))
    return rates.diaNat;
  if (t.includes("lab") || t.includes("grown")) return rates.diaLab;
  return null; // not a diamond option
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const rate = await prisma.dailyRate.findUnique({
    where: { shop: session.shop },
  });

  const values = Object.fromEntries(
    FIELDS.map(({ key }) => [key, rate ? String(rate[key]) : "0"]),
  );

  return {
    values,
    shop: session.shop,
    lastUpdated: rate?.updatedAt ?? null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — GraphQL pagination
// ─────────────────────────────────────────────────────────────────────────────

// Fetch all products with their variants + the 3 metafields we need
async function fetchAllProducts(admin) {
  const products = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await admin.graphql(
      `#graphql
      query getProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            title
            # Product-level defaults
            goldWeight: metafield(namespace: "custom", key: "gold_weight") {
              value
            }
            diamondWeight: metafield(namespace: "custom", key: "diamond_weight") {
              value
            }
            stonePrice: metafield(namespace: "custom", key: "stone_price") {
              value
            }
            makingCharges: metafield(namespace: "custom", key: "making_charges") {
              value
            }
            variants(first: 100) {
              nodes {
                id
                title
                selectedOptions { name value }
                # Per-variant overrides (optional — falls back to product-level)
                goldWeight: metafield(namespace: "custom", key: "gold_weight") {
                  value
                }
                diamondWeight: metafield(namespace: "custom", key: "diamond_weight") {
                  value
                }
                stonePrice: metafield(namespace: "custom", key: "stone_price") {
                  value
                }
                makingCharges: metafield(namespace: "custom", key: "making_charges") {
                  value
                }
              }
            }
          }
        }
      }`,
      { variables: { cursor } },
    );

    const json = await res.json();
    const page = json.data.products;

    products.push(...page.nodes);
    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  return products;
}

// Bulk update all variant prices for one product
async function bulkUpdateVariantPrices(admin, productId, variants) {
  if (!variants.length) return [];

  const res = await admin.graphql(
    `#graphql
    mutation bulkUpdatePrices(
      $productId: ID!
      $variants: [ProductVariantsBulkInput!]!
    ) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id price }
        userErrors      { field message }
      }
    }`,
    { variables: { productId, variants } },
  );

  const json = await res.json();
  return json.data?.productVariantsBulkUpdate?.userErrors ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION
// ─────────────────────────────────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);

  // ── 1. Validate ────────────────────────────────────────────────────────────
  const errors = {};
  const parsed = {};

  FIELDS.forEach(({ key, label }) => {
    const v = parseFloat(raw[key]);
    if (isNaN(v) || v < 0) {
      errors[key] = `${label} must be 0 or a positive number`;
    } else {
      parsed[key] = v;
    }
  });

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // ── 2. Save to Prisma ──────────────────────────────────────────────────────
  await prisma.dailyRate.upsert({
    where: { shop: session.shop },
    update: parsed,
    create: { shop: session.shop, ...parsed },
  });

  // ── 3. Mirror to Shop Metafields (storefront Liquid reads these) ───────────
  const shopRes = await admin.graphql(
    `#graphql
    query {
      shop {
        id
      }
    }`,
  );
  const shopJson = await shopRes.json();
  const shopId = shopJson.data.shop.id;

  const metafields = FIELDS.map(({ key, metaKey }) => ({
    namespace: METAFIELD_NAMESPACE,
    key: metaKey,
    value: String(parsed[key].toFixed(2)),
    type: "number_decimal",
    ownerId: shopId,
  }));

  const metaRes = await admin.graphql(
    `#graphql
    mutation setRates($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    { variables: { metafields } },
  );
  const metaJson = await metaRes.json();
  const metaErrors = metaJson.data?.metafieldsSet?.userErrors ?? [];

  if (metaErrors.length > 0) {
    return {
      ok: false,
      errors: { general: metaErrors.map((e) => e.message).join(", ") },
    };
  }

  // ── 4. Fetch all products + variants ──────────────────────────────────────
  const products = await fetchAllProducts(admin);

  // ── 5. Reprice every variant ───────────────────────────────────────────────
  const repriceResults = { updated: 0, skipped: 0, errors: [] };

  for (const product of products) {
    const variantUpdates = [];

    // Product-level fallback values
    const productGoldWeight = parseFloat(product.goldWeight?.value ?? 0) || 0;
    const productDiamondWeight =
      parseFloat(product.diamondWeight?.value ?? 0) || 0;
    const productStonePrice = parseFloat(product.stonePrice?.value ?? 0) || 0;
    const productMakingCharges =
      parseFloat(product.makingCharges?.value ?? 0) || 0;

    for (const variant of product.variants.nodes) {
      // Per-variant overrides (fall back to product-level)
      const goldWeight =
        parseFloat(variant.goldWeight?.value ?? productGoldWeight) ||
        productGoldWeight;
      const diamondWeight =
        parseFloat(variant.diamondWeight?.value ?? productDiamondWeight) ||
        productDiamondWeight;
      const stonePrice =
        parseFloat(variant.stonePrice?.value ?? productStonePrice) ||
        productStonePrice;
      const makingCharges =
        parseFloat(variant.makingCharges?.value ?? productMakingCharges) ||
        productMakingCharges;

      // Determine which metal and diamond rates apply to this variant
      // by inspecting its selectedOptions
      let goldRate = null;
      let diamondRate = null;

      for (const opt of variant.selectedOptions) {
        const gRate = getMetalRate(opt.value, parsed);
        const dRate = getDiamondRate(opt.value, parsed);
        if (gRate !== null) goldRate = gRate;
        if (dRate !== null) diamondRate = dRate;
      }

      // Skip variants that don't match any metal or diamond option
      // (e.g. size-only variants on non-jewelry products)
      if (goldRate === null && diamondRate === null) {
        repriceResults.skipped++;
        continue;
      }

      // Use 0 for whichever component isn't present
      const gRate = goldRate ?? 0;
      const dRate = diamondRate ?? 0;

      // Formula:
      // price = (gold_weight × gold_rate_per_gram)
      //       + (diamond_weight × stone_price / diamond_rate_per_unit)
      //       + making_charges
      const newPrice =
        goldWeight * gRate + diamondWeight * dRate + stonePrice + makingCharges;

      if (newPrice <= 0) {
        repriceResults.skipped++;
        continue;
      }

      variantUpdates.push({
        id: variant.id,
        price: newPrice.toFixed(2),
      });
    }

    if (variantUpdates.length === 0) continue;

    // Shopify max 100 variants per bulkUpdate call — chunk if needed
    const CHUNK = 100;
    for (let i = 0; i < variantUpdates.length; i += CHUNK) {
      const chunk = variantUpdates.slice(i, i + CHUNK);
      const errors = await bulkUpdateVariantPrices(admin, product.id, chunk);

      if (errors.length > 0) {
        repriceResults.errors.push({
          product: product.title,
          errors,
        });
      } else {
        repriceResults.updated += chunk.length;
      }
    }
  }

  return {
    ok: true,
    savedAt: new Date().toISOString(),
    repriced: repriceResults,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// HOOK — wire native DOM events to React refs
// ─────────────────────────────────────────────────────────────────────────────
function useNativeEvent(ref, event, handler) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener(event, handler);
    return () => el.removeEventListener(event, handler);
  }, [ref, event, handler]);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — s-number-field wired to React state
// ─────────────────────────────────────────────────────────────────────────────
function RateField({ fieldKey, label, unit, value, error, onChange }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.value = value;
  }, [value]);

  const handleChange = useCallback(
    (e) => onChange(fieldKey, e.currentTarget?.value ?? e.target?.value ?? "0"),
    [fieldKey, onChange],
  );
  useNativeEvent(ref, "change", handleChange);

  return (
    <s-number-field
      ref={ref}
      label={`${label} (${unit})`}
      prefix="₹"
      min={0}
      step={0.01}
      input-mode="decimal"
      error={error || undefined}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function RatesPage() {
  const { values, lastUpdated } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting";

  const [form, setForm] = useState(() => ({ ...values }));
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = useCallback((key, val) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    submit(form, { method: "POST" });
    setIsDirty(false);
  }, [form, submit]);

  const handleDiscard = useCallback(() => {
    setForm({ ...values });
    setIsDirty(false);
  }, [values]);

  const saveBtnRef = useRef(null);
  const discardBtnRef = useRef(null);
  useNativeEvent(saveBtnRef, "click", handleSave);
  useNativeEvent(discardBtnRef, "click", handleDiscard);

  const metalFields = FIELDS.filter((f) => f.group === "metal");
  const diamondFields = FIELDS.filter((f) => f.group === "diamond");

  const repriced = actionData?.repriced;

  return (
    <s-page heading="Daily Pricing Rates">
      <s-button
        slot="primary-action"
        variant="primary"
        ref={saveBtnRef}
        loading={isSaving || undefined}
        disabled={(!isDirty && !isSaving) || undefined}
      >
        {isSaving ? "Saving & repricing…" : "Save rates"}
      </s-button>

      {isDirty && (
        <s-button slot="secondary-actions" ref={discardBtnRef}>
          Discard
        </s-button>
      )}

      {/* ── Success banner with reprice summary ── */}
      {actionData?.ok === true && (
        <s-banner tone="success" title="Rates saved — all variants repriced">
          {repriced && (
            <span>
              {repriced.updated} variant{repriced.updated !== 1 ? "s" : ""}{" "}
              updated
              {repriced.skipped > 0
                ? `, ${repriced.skipped} skipped (no metal/diamond options)`
                : ""}
              . Product page, cart and checkout now show the correct prices.
            </span>
          )}
        </s-banner>
      )}

      {/* ── Error banners ── */}
      {actionData?.ok === false && actionData?.errors?.general && (
        <s-banner tone="critical" title="Save failed">
          {actionData.errors.general}
        </s-banner>
      )}

      {repriced?.errors?.length > 0 && (
        <s-banner tone="warning" title="Some products failed to reprice">
          {repriced.errors.map((e) => e.product).join(", ")}
        </s-banner>
      )}

      <s-banner tone="info">
        Saving rates will immediately reprice <strong>all variants</strong>{" "}
        across all products using the formula:
        <br />
        <code>
          price = (gold_weight × gold_rate) + (diamond_weight × diamond_rate) +
          stone_price + making_charges
        </code>
        <br />
        Weights are read from <code>custom.gold_weight</code> and{" "}
        <code>custom.diamond_weight</code> metafields. Stone price from{" "}
        <code>custom.stone_price</code> and making charges from{" "}
        <code>custom.making_charges</code>.
      </s-banner>

      <s-section>
        <s-grid>
          {/* ── Left: rate input forms ── */}
          <s-grid-item column-span="2">
            <s-stack direction="block" gap="base">
              <s-box
                padding="base"
                background="base"
                border-width="base"
                border-color="base"
                border-radius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-heading>Metal rates (₹ per gram)</s-heading>
                  <s-text tone="subdued">
                    Multiplied by <code>custom.metal_weight_grams</code> on each
                    product/variant.
                  </s-text>
                  <s-grid>
                    {metalFields.map((f) => (
                      <s-grid-item key={f.key}>
                        <RateField
                          fieldKey={f.key}
                          label={f.label}
                          unit={f.unit}
                          value={form[f.key]}
                          error={actionData?.errors?.[f.key]}
                          onChange={handleChange}
                        />
                      </s-grid-item>
                    ))}
                  </s-grid>
                </s-stack>
              </s-box>

              <s-box
                padding="base"
                background="base"
                border-width="base"
                border-color="base"
                border-radius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-heading>Diamond rates (₹ per carat)</s-heading>
                  <s-text tone="subdued">
                    Multiplied by <code>custom.diamond_carat</code> on each
                    product/variant.
                  </s-text>
                  <s-grid>
                    {diamondFields.map((f) => (
                      <s-grid-item key={f.key}>
                        <RateField
                          fieldKey={f.key}
                          label={f.label}
                          unit={f.unit}
                          value={form[f.key]}
                          error={actionData?.errors?.[f.key]}
                          onChange={handleChange}
                        />
                      </s-grid-item>
                    ))}
                  </s-grid>
                </s-stack>
              </s-box>
            </s-stack>
          </s-grid-item>

          {/* ── Right: formula + preview ── */}
          <s-grid-item>
            <s-stack direction="block" gap="base">
              <s-box
                padding="base"
                background="base"
                border-width="base"
                border-color="base"
                border-radius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-heading>Price formula</s-heading>
                  <FormulaPreview form={form} />
                </s-stack>
              </s-box>

              <s-box
                padding="base"
                background="base"
                border-width="base"
                border-color="base"
                border-radius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-heading>Required metafields</s-heading>
                  <table style={tbl.table}>
                    <thead>
                      <tr>
                        <th style={tbl.th}>Metafield key</th>
                        <th style={tbl.th}>Set on</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          key: "custom.gold_weight",
                          on: "Product or Variant",
                        },
                        {
                          key: "custom.diamond_weight",
                          on: "Product or Variant",
                        },
                        {
                          key: "custom.stone_price",
                          on: "Product or Variant",
                        },
                        {
                          key: "custom.making_charges",
                          on: "Product or Variant",
                        },
                      ].map(({ key, on }) => (
                        <tr key={key}>
                          <td style={tbl.td}>
                            <code style={tbl.code}>{key}</code>
                          </td>
                          <td style={{ ...tbl.td, color: "#6d7175" }}>{on}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {lastUpdated && (
                    <s-text tone="subdued">
                      Last saved: {new Date(lastUpdated).toLocaleString()}
                    </s-text>
                  )}
                </s-stack>
              </s-box>
            </s-stack>
          </s-grid-item>
        </s-grid>
      </s-section>
    </s-page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — formula preview with example weights
// ─────────────────────────────────────────────────────────────────────────────
function FormulaPreview({ form }) {
  const g = (k) => Math.max(0, parseFloat(form[k]) || 0);

  // Example: 5g ring + 0.25ct diamond + ₹500 making charge
  const METAL_WEIGHT = 5;
  const DIAMOND_CARAT = 0.25;
  const MAKING = 500;

  const combos = [
    {
      metal: "18K Gold",
      mRate: g("gold18k"),
      dLabel: "Natural",
      dRate: g("diaNat"),
    },
    {
      metal: "18K Gold",
      mRate: g("gold18k"),
      dLabel: "Lab-grown",
      dRate: g("diaLab"),
    },
    {
      metal: "14K Gold",
      mRate: g("gold14k"),
      dLabel: "Natural",
      dRate: g("diaNat"),
    },
    {
      metal: "14K Gold",
      mRate: g("gold14k"),
      dLabel: "Lab-grown",
      dRate: g("diaLab"),
    },
    {
      metal: "9K Gold",
      mRate: g("gold9k"),
      dLabel: "Natural",
      dRate: g("diaNat"),
    },
    {
      metal: "9K Gold",
      mRate: g("gold9k"),
      dLabel: "Lab-grown",
      dRate: g("diaLab"),
    },
  ];

  return (
    <>
      <s-text tone="subdued">
        Example: {METAL_WEIGHT}g metal · {DIAMOND_CARAT}ct diamond · ₹{MAKING}{" "}
        making
      </s-text>
      <table style={tbl.table}>
        <thead>
          <tr>
            <th style={tbl.th}>Variant</th>
            <th style={{ ...tbl.th, textAlign: "right" }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {combos.map(({ metal, mRate, dLabel, dRate }) => {
            const price = METAL_WEIGHT * mRate + DIAMOND_CARAT * dRate + MAKING;
            return (
              <tr key={metal + dLabel}>
                <td style={tbl.td}>
                  {metal} + {dLabel}
                </td>
                <td style={{ ...tbl.td, textAlign: "right", fontWeight: 500 }}>
                  ₹{price.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const tbl = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "4px 6px 8px",
    borderBottom: "1px solid #e1e3e5",
    fontSize: 12,
    color: "#6d7175",
    fontWeight: 500,
  },
  td: {
    padding: "7px 6px",
    borderBottom: "1px solid #f1f2f3",
    color: "#202223",
    verticalAlign: "top",
  },
  code: {
    background: "#f1f2f3",
    borderRadius: 4,
    padding: "1px 6px",
    fontSize: 11,
    fontFamily: "monospace",
  },
};
