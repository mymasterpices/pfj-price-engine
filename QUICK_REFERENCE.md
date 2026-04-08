# PFJ Pricing Engine - Quick Reference

## The Problem We're Solving

User selects metal/diamond → Price updates on product page ✓  
User clicks "Add to Cart" → Price should be updated to cart ✓  
Checkout shows correct price with surcharge ✓

## The Solution Flow

1. **Admin configures rates** → stored in Prisma + Shop Metafields
2. **Product page reads rates** → from Shop Metafields (no API calls needed)
3. **User selects options** → JavaScript calculates surcharge dynamically
4. **On add to cart** → surcharge stored in form properties as `properties[_surcharge]`
5. **Shopify converts** → form properties → cart attributes automatically
6. **Cart transform triggers** → reads `_surcharge` from cart attributes
7. **Final price applied** → base price + surcharge via Shopify's API
8. **Checkout displays** → correct total price to customer

## Key Code Locations

| File                                                      | Purpose                                       |
| --------------------------------------------------------- | --------------------------------------------- |
| `app/routes/app.rates.jsx`                                | Admin panel to set daily rates                |
| `extensions/pfj-pricing-ex/blocks/price-selector.liquid`  | Storefront product page block                 |
| `extensions/pfj-cart-transform/src/cart_transform_run.js` | Cart transform function (applies final price) |
| `app/routes/api.calculate-price.jsx`                      | API for price calculations                    |
| `app/routes/api.sync-cart.jsx`                            | API for cart sync logging                     |

## Critical Data Flow Points

### 1. Rates Storage (Admin → Storefront)

```
Prisma DB (admin input)
    ↓
Shop Metafields (pfj_pricing namespace)
    ↓
Liquid Access (shop.metafields.pfj_pricing.*)
    ↓
JavaScript in Block (gets rates from Liquid data attributes)
```

### 2. Surcharge Transfer (Page → Cart → Checkout)

```
User Selection (dropdown change)
    ↓
JavaScript Calculation (metal surcharge + diamond surcharge)
    ↓
Hidden Form Input (properties[_surcharge] = "45000")
    ↓
Form Submit to /cart/add
    ↓
Shopify Converts properties[] → cart attributes
    ↓
Cart Transform Reads attribute (attribute(key: "_surcharge"))
    ↓
Expand Operation (fixedPricePerUnit = base + surcharge)
    ↓
Checkout Price (customer sees correct total)
```

## Debugging Console Commands

**Product Page:**

```javascript
// Check if block is initialized
console.log(document.getElementById("pfj-selector"));

// Check form surcharge property
document.querySelector(
  'form[action*="/cart/add"] input[name="properties[_surcharge]"]',
).value;

// Get current selections
document.querySelector('[data-pfj="metal"]').value; // metal surcharge in cents
document.querySelector('[data-pfj="diamond"]').value; // diamond surcharge in cents

// Manually calculate total price
var base = parseInt(
  document.querySelector('[data-price-type="regular"]').dataset.price,
);
var sur =
  parseInt(document.querySelector('[data-pfj="metal"]').value) +
  parseInt(document.querySelector('[data-pfj="diamond"]').value);
alert("Base: " + base + ", Surcharge: " + sur + ", Total: " + (base + sur));
```

**Cart/Checkout Page:**

```javascript
// Look for transform logs
// Filter: [PFJ-Transform]
// Shows: processing lines, surcharge found, calculations, operations applied
```

## Common Issues & Fixes

| Issue                 | Debug Step                         | Fix                                 |
| --------------------- | ---------------------------------- | ----------------------------------- |
| Price doesn't update  | Check: `[data-pfj="metal"]` exists | Add block to page, refresh          |
| Surcharge not in cart | Check: hidden inputs in form       | Verify form properties set          |
| Cart shows base price | Check: cart transform logs         | Verify \_surcharge attribute exists |
| Variant price wrong   | Check: base price update           | Refresh page after variant select   |

## Testing Checklist

### Unit Tests

```bash
npm run test --workspace=extensions/pfj-cart-transform
```

### Integration Test

1. Set rates to: 18K Gold = $60, Natural Diamond = $5000
2. Add product with 18K Gold + Natural Diamond
3. Expected cart price: (base + 60*100 + 5000*100) cents
4. Verify in console: `[PFJ-Transform] totalDecimal`

### Edge Cases

- [ ] Standard + No Diamond = base price only (no expand)
- [ ] Large quantities = (base + surcharge) × qty
- [ ] Multiple variants = correct base for each variant
- [ ] Mix of items = each line calculated independently
- [ ] Rate change during session = reflects on page only (cart stays same)

## Key Constants & Values

```
Surcharge Encoding:
- Stored in cents (e.g., 45000 = ₹450.00)
- Format: "45000" (always string in form properties)
- Range: 0 to any positive number

Rates From Admin:
- gold18k, gold14k, gold9k = per gram
- diaNat, diaLab = per carat
- Stored as decimals (e.g., 60.50)
- Converted to cents in Liquid (times 100)

Currency Support:
- Primary: INR (₹)
- Supported: USD ($), GBP (£), EUR (€)
- From: shop.currency
```

## Performance Notes

1. **No API calls from product page** - rates from metafields
2. **Lazy calculation** - only when user selects
3. **No polling** - form properties updated on change event
4. **Cart transform fast** - runs server-side, not per-request

## Monitoring in Production

Watch these logs:

- `[PFJ-Debug]` - Product page JavaScript
- `[PFJ]` - Form synchronization
- `[PFJ-Transform]` - Cart transform execution

If you see `[PFJ-Transform] No _surcharge attribute found`, it means:

- Form properties not converted to cart attributes
- OR form not submitted properly
- Check: form action, property names, submission method
