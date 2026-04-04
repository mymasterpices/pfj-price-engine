// extensions/pfj-cart-transform/src/cart_transform_run.js
//
// KEY FIX: _surcharge = SURCHARGE CENTS ONLY (not total price)
//
// Previously: _surcharge = basePrice + surcharge (total cents)
//   → fixedPricePerUnit was set to total ✅ but was fragile if base price
//     changed between page load and checkout (currency conversion, discounts)
//
// Now: _surcharge = surcharge only (e.g. 45000 = ₹450 metal surcharge)
//   → fixedPricePerUnit = variant's own cost + surcharge
//   → Shopify's own pricing is the source of truth for the base price
//
// This also means: if _surcharge = 0 or missing, we skip — no price change.
// The variant price remains exactly as set in Shopify admin.

/**
 * @param {import("../generated/api").RunInput} input
 * @returns {import("../generated/api").FunctionRunResult}
 */
export function cartTransformRun(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const attr = line.attribute;

    // Skip lines with no surcharge
    if (!attr?.value) continue;

    const rawValue = attr.value.trim();
    if (rawValue === "" || rawValue === "0") continue;

    // _surcharge = SURCHARGE ONLY in cents (e.g. 45000 = ₹450.00)
    const surchargeCents = parseInt(rawValue, 10);
    if (isNaN(surchargeCents) || surchargeCents <= 0) continue;

    // Base price from Shopify's own cart cost — always accurate
    // cost.amountPerQuantity.amount is a decimal string e.g. "2499.00"
    const baseCents = Math.round(
      parseFloat(line.cost.amountPerQuantity.amount) * 100,
    );

    // Final price = base + surcharge, both in cents
    const totalCents = baseCents + surchargeCents;
    const totalDecimal = (totalCents / 100).toFixed(2);

    // Currency from Shopify's cart — always correct for the buyer's locale
    const currencyCode = line.cost.amountPerQuantity.currencyCode ?? "INR";

    operations.push({
      expand: {
        cartLineId: line.id,
        expandedCartItems: [
          {
            merchandiseId: line.merchandise.id,
            quantity: line.quantity,
            price: {
              adjustment: {
                fixedPricePerUnit: {
                  amount: totalDecimal, // e.g. "2949.00"
                  currencyCode: currencyCode, // "INR"
                },
              },
            },
          },
        ],
      },
    });
  }

  return { operations };
}
