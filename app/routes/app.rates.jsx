// app/routes/app.rates.jsx
// Daily rates admin form.
// loader  → reads from Prisma
// action  → validates, writes Prisma, mirrors to Shop Metafields via GraphQL
// UI      → correct Polaris s- web components, events via useRef + addEventListener

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

// ─────────────────────────────────────────────────────────────────────────────
// LOADER — read from Prisma
// ─────────────────────────────────────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const rate = await prisma.dailyRate.findUnique({
    where: { shop: session.shop },
  });

  // Return safe defaults if no row exists yet
  const values = {};
  FIELDS.forEach(({ key }) => {
    values[key] = rate ? String(rate[key]) : "0";
  });

  return { values, shop: session.shop, lastUpdated: rate?.updatedAt ?? null };
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION — validate → Prisma upsert → mirror to Shop Metafields
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

  // ── 2. Prisma upsert ───────────────────────────────────────────────────────
  await prisma.dailyRate.upsert({
    where: { shop: session.shop },
    update: parsed,
    create: { shop: session.shop, ...parsed },
  });

  // ── 3. Mirror to Shop Metafields ───────────────────────────────────────────
  // This lets the storefront read rates in Liquid with zero API calls:
  //   {{ shop.metafields.pfj_pricing.gold_18k.value }}
  const shopResponse = await admin.graphql(`#graphql
    query { shop { id } }
  `);
  const { data: shopData } = await shopResponse.json();
  const shopId = shopData.shop.id;

  const metafields = FIELDS.map(({ key, metaKey }) => ({
    namespace: METAFIELD_NAMESPACE,
    key: metaKey,
    value: String(parsed[key].toFixed(2)),
    type: "number_decimal",
    ownerId: shopId,
  }));

  const metaResponse = await admin.graphql(
    `#graphql
    mutation setRates($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key value }
        userErrors  { field message }
      }
    }`,
    { variables: { metafields } },
  );

  const { data: metaData } = await metaResponse.json();
  const userErrors = metaData?.metafieldsSet?.userErrors ?? [];

  if (userErrors.length > 0) {
    return {
      ok: false,
      errors: { general: userErrors.map((e) => e.message).join(", ") },
    };
  }

  return { ok: true, savedAt: new Date().toISOString() };
};

// ─────────────────────────────────────────────────────────────────────────────
// HOOK — wire native DOM event to a React ref
// Required because React synthetic events don't bridge into custom elements.
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
// SUB-COMPONENT — single s-number-field wired to React state
// ─────────────────────────────────────────────────────────────────────────────
function RateField({ fieldKey, label, unit, value, error, onChange }) {
  const ref = useRef(null);

  // Push React state → web component DOM property
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
      prefix="$"
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

  // Form state
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

  // Button refs — needed because s-button is a custom element
  const saveBtnRef = useRef(null);
  const discardBtnRef = useRef(null);
  useNativeEvent(saveBtnRef, "click", handleSave);
  useNativeEvent(discardBtnRef, "click", handleDiscard);

  const metalFields = FIELDS.filter((f) => f.group === "metal");
  const diamondFields = FIELDS.filter((f) => f.group === "diamond");

  return (
    <s-page heading="Daily Pricing Rates">
      {/* ── Page actions (slots) ── */}
      <s-button
        slot="primary-action"
        variant="primary"
        ref={saveBtnRef}
        loading={isSaving || undefined}
        disabled={(!isDirty && !isSaving) || undefined}
      >
        Save rates
      </s-button>

      {isDirty && (
        <s-button slot="secondary-actions" ref={discardBtnRef}>
          Discard
        </s-button>
      )}

      {/* ── Banners ── */}
      {actionData?.ok === true && (
        <s-banner tone="success" title="Rates saved">
          Prices updated in database and mirrored to Shop Metafields. The
          storefront will reflect changes instantly.
        </s-banner>
      )}

      {actionData?.ok === false && actionData?.errors?.general && (
        <s-banner tone="critical" title="Save failed">
          {actionData.errors.general}
        </s-banner>
      )}

      <s-banner tone="info">
        Rates are saved to Prisma and mirrored to Shop Metafields (namespace:{" "}
        <strong>pfj_pricing</strong>). The product page block reads them
        directly from Liquid — zero API calls, instant updates.
      </s-banner>

      <s-section>
        <s-grid>
          {/* ── Left col: forms ── */}
          <s-grid-item column-span="2">
            <s-stack direction="block" gap="base">
              {/* Metal */}
              <s-box
                padding="base"
                background="base"
                border-width="base"
                border-color="base"
                border-radius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-heading>Metal surcharges</s-heading>
                  <s-text tone="subdued">
                    Added to the base product price when a metal is selected.
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

              {/* Diamond */}
              <s-box
                padding="base"
                background="base"
                border-width="base"
                border-color="base"
                border-radius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-heading>Diamond surcharges</s-heading>
                  <s-text tone="subdued">
                    Added when a diamond type is selected.
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

          {/* ── Right col: preview + info ── */}
          <s-grid-item>
            <s-stack direction="block" gap="base">
              {/* Live preview */}
              <s-box
                padding="base"
                background="base"
                border-width="base"
                border-color="base"
                border-radius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-heading>Live preview</s-heading>
                  <s-text tone="subdued">Base price $100</s-text>
                  <LivePreview form={form} />
                </s-stack>
              </s-box>

              {/* Meta info */}
              <s-box
                padding="base"
                background="base"
                border-width="base"
                border-color="base"
                border-radius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-heading>Metafield reference</s-heading>
                  <table style={tbl.table}>
                    <tbody>
                      <Row label="Namespace" val="pfj_pricing" />
                      <Row label="Type" val="number_decimal" />
                      {FIELDS.map((f) => (
                        <Row key={f.key} label="Key" val={f.metaKey} />
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
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function LivePreview({ form }) {
  const BASE = 100;
  const g = (k) => Math.max(0, parseFloat(form[k]) || 0);

  const rows = [
    { label: "Base only", metal: 0, dia: 0 },
    { label: "18K + Natural diamond", metal: g("gold18k"), dia: g("diaNat") },
    { label: "18K + Lab grown", metal: g("gold18k"), dia: g("diaLab") },
    { label: "14K + Natural diamond", metal: g("gold14k"), dia: g("diaNat") },
    { label: "9K + Lab grown", metal: g("gold9k"), dia: g("diaLab") },
  ];

  return (
    <table style={tbl.table}>
      <thead>
        <tr>
          <th style={tbl.th}>Combination</th>
          <th style={{ ...tbl.th, textAlign: "right" }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, metal, dia }) => (
          <tr key={label}>
            <td style={tbl.td}>{label}</td>
            <td style={{ ...tbl.td, textAlign: "right", fontWeight: 500 }}>
              ${(BASE + metal + dia).toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Row({ label, val }) {
  return (
    <tr>
      <td style={{ ...tbl.td, color: "#6d7175", width: "40%" }}>{label}</td>
      <td style={tbl.td}>
        <code style={tbl.code}>{val}</code>
      </td>
    </tr>
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
