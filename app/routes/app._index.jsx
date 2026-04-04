// app/routes/app._index.jsx
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server"; // ✅ default import

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // ✅ Safe — returns null if no record, never crashes
  const rate = await prisma.dailyRate.findUnique({
    where: { shop: session.shop },
  });

  return {
    hasRates: !!rate,
    lastUpdated: rate?.updatedAt ?? null,
    rates: rate ?? null,
  };
};

export default function Index() {
  const { hasRates, lastUpdated } = useLoaderData();

  return (
    <s-page heading="PFJ Pricing Engine">
      <s-button slot="primary-action" variant="primary" url="/app/rates">
        Manage Daily Rates
      </s-button>

      {/* Status banner */}
      {hasRates ? (
        <s-banner tone="success" title="Rates are configured">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </s-banner>
      ) : (
        <s-banner tone="warning" title="No rates set yet">
          Click "Manage Daily Rates" to set your first pricing rates.
        </s-banner>
      )}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-box
            padding="base"
            background="base"
            border-width="base"
            border-color="base"
            border-radius="base"
          >
            <s-stack direction="block" gap="base">
              <s-heading>How it works</s-heading>
              <s-text>
                1. Set daily metal and diamond rates in the rates page.
              </s-text>
              <s-text>
                2. Rates are saved to Prisma and mirrored to Shop Metafields.
              </s-text>
              <s-text>
                3. The storefront block reads rates directly from Liquid.
              </s-text>
              <s-text>
                4. Customer selects metal and diamond on the product page.
              </s-text>
              <s-text>
                5. Cart Transform Function applies the correct price at
                checkout.
              </s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}
