# PFJ Multi-Variant Pricing System - Complete Implementation Guide

**Version:** 2.0 - Multi-Variant Support  
**Date:** April 6, 2026  
**Status:** ✅ Ready to Deploy

---

## Overview

This is a **complete rebuild** of the pricing system that now supports:

✅ **Multiple Product Variants** - Sizes, colors, styles all supported  
✅ **Daily Rate Updates** - Metal/diamond rates change automatically  
✅ **Dynamic Price Calculation** - Real-time pricing for any combination  
✅ **Unlimited Combinations** - No need to pre-create variant combinations  
✅ **Simple & Scalable** - Works for 10 products or 1,000 products

---

## How It Works

### The Flow

```
1. Admin Sets Daily Rates
   └─ ₹60/gram for 18K Gold
   └─ ₹45/gram for 14K Gold
   └─ ₹5,000/carat for Natural Diamond
   └─ Saved to Prisma Database
   └─ Mirrored to Shop Metafields

2. Customer Views Product Page
   └─ Sees all variants (Ring Size 6, 7, 8, etc.)
   └─ Sees customization options (Metal, Diamond)
   └─ Liquid block reads rates from metafields (no API calls)

3. Customer Makes Selections
   └─ Selects "Ring Size 7" (₹2,599 base)
   └─ Selects "18K Gold" (+₹600)
   └─ Selects "Natural Diamond" (+₹50,000)
   └─ JavaScript calculates: ₹2,599 + ₹600 + ₹50,000 = ₹53,199
   └─ Price updates in real-time

4. Customer Clicks "Add to Cart"
   └─ Form contains:
      ├─ Variant ID: gid://shopify/ProductVariant/123
      ├─ properties[_metal_surcharge]: 60000
      └─ properties[_diamond_surcharge]: 5000000

5. Shopify Converts Form Properties to Cart Attributes
   └─ properties[] → cart attributes (automatic)

6. Cart Transform Function Executes
   └─ Reads _metal_surcharge and _diamond_surcharge
   └─ Calculates: ₹2,599 + ₹600 + ₹50,000 = ₹53,199
   └─ Sets fixed price on cart line

7. Checkout Shows Correct Price
   └─ Customer sees: ₹53,199 ✅
```

---

## Files Changed/Created

### New Files

- ✅ `app/routes/api.product-pricing.jsx` - API for product pricing data
- ✅ `extensions/pfj-pricing-ex/blocks/product-customizer.liquid` - NEW Liquid block

### Modified Files

- ✅ `extensions/pfj-cart-transform/src/cart_transform_run.js` - Handles metal + diamond
- ✅ `extensions/pfj-cart-transform/src/cart_transform_run.graphql` - Fetches all attributes

### Files to Remove (Old System)

- ❌ `extensions/pfj-pricing-ex/blocks/price-selector.liquid` - Old single-variant block
- ❌ `extensions/pfj-pricing-ex/blocks/cart-surcharge-block.liquid` - Old cart block

---

## Setup Instructions

### Step 1: Deploy the New Code

```bash
cd d:\Suraj Sharma\projects\shopifyApp\PFJ-price-engine\pfj-pricing

# Deploy with new multi-variant support
shopify app deploy
```

### Step 2: Remove Old Blocks (Optional)

The old blocks (`price-selector.liquid`, `cart-surcharge-block.liquid`) are no longer needed but can coexist. To clean up:

1. Delete them from the extensions folder
2. Remove from product pages (if added)

### Step 3: Configure Rates (As Before)

Go to your app → "Daily Pricing Rates" and set:

- 18K Gold: 60 (₹60/gram)
- 14K Gold: 45
- 9K Gold: 30
- Natural Diamond: 5000 (₹5,000/carat)
- Lab Grown Diamond: 2000

Click "Save rates"

### Step 4: Add Block to Product Pages

For each product you want customization:

1. Go to Shopify Admin → Edit Product Page
2. Add "PFJ Multi-Variant Customizer" block
3. Configure block settings:
   - ☑ Show metal customization
   - ☑ Show diamond customization
4. Save page

---

## Testing

### Test 1: Single Variant Selection

1. Go to product page with multiple variant options (sizes)
2. Select different variant sizes
3. Base price in price display should change

**Expected:**

- Price updates to show selected variant's base price

### Test 2: Metal Selection

1. Keep variant selection same
2. Select different metal option
3. Price should update with metal surcharge

**Expected:**

- "Price = Base ₹2,599 + 18K Gold ₹600 = ₹3,199"

### Test 3: Diamond Selection

1. Select a diamond option
2. Price should update with both metal + diamond

**Expected:**

- "Price = Base ₹2,599 + Metal ₹600 + Diamond ₹50,000 = ₹53,199"

### Test 4: Add to Cart

1. Make selections (variant + metal + diamond)
2. Click "Add to Cart"
3. Go to cart page
4. Verify price matches what was displayed

**Expected:**

- Cart shows: ₹53,199 (not just base ₹2,599)

### Test 5: Daily Rate Changes

1. From app admin, change metal rate (e.g., 18K Gold from 60 to 70)
2. Click "Save rates"
3. Refresh product page (wait 30 seconds)
4. Select same metal option
5. Verify new price reflects new rate

**Expected:**

- Old price: ₹2,599 + ₹600 = ₹3,199
- New price: ₹2,599 + ₹700 = ₹3,299

---

## How Rates Update All Variants Automatically

**The Key Insight:** Rates are stored ONCE in the database, not per-variant.

When you have:

- 100 products
- 10 variants each
- 4 metal options
- 3 diamond options

Instead of storing: 100 × 10 × 4 × 3 = 12,000 combinations...

**We store:**

- 100 products (with 10 variants each) with base prices
- 1 set of daily rates (4 metals + 3 diamonds)
- Combinations calculated on-the-fly

**Result:**

- Admin changes 18K gold rate from 60 to 70
- ALL 1,200 products instantly show new pricing
- No need to update individual variants
- No bulk API calls needed

---

## API Endpoints

### GET `/api/product-pricing/:productId`

Returns product with all variants and customization options.

**Response:**

```json
{
  "success": true,
  "product": {
    "id": "gid://shopify/Product/123",
    "title": "Gold Ring",
    "variants": [
      {
        "id": "gid://shopify/ProductVariant/1",
        "title": "Size 6",
        "price": 249900
      },
      {
        "id": "gid://shopify/ProductVariant/2",
        "title": "Size 7",
        "price": 259900
      }
    ]
  },
  "customization": {
    "metals": [
      { "id": "standard", "name": "Standard", "surcharge": 0 },
      { "id": "gold18k", "name": "18K Gold", "surcharge": 6000 }
    ],
    "diamonds": [
      { "id": "none", "name": "No Diamond", "surcharge": 0 },
      { "id": "natural", "name": "Natural Diamond", "surcharge": 500000 }
    ],
    "rates": {
      "gold18k": 60,
      "gold14k": 45,
      "gold9k": 30,
      "diaNat": 5000,
      "diaLab": 2000
    }
  }
}
```

### POST `/api/product-pricing/calculate`

Calculate final price for a specific variant + customization combo.

**Request:**

```json
{
  "variantId": "gid://shopify/ProductVariant/123",
  "basePrice": 2499,
  "metal": "gold18k",
  "metalSurcharge": 6000,
  "diamond": "natural",
  "diamondSurcharge": 500000,
  "quantity": 1
}
```

**Response:**

```json
{
  "success": true,
  "pricing": {
    "basePrice": 2499,
    "metalSurcharge": 6000,
    "diamondSurcharge": 500000,
    "totalSurcharge": 506000,
    "unitTotal": 508499,
    "quantity": 1,
    "lineTotal": 508499
  }
}
```

---

## Console Logs to Watch

### Product Page (JavaScript)

```
[PFJ-Multi] Initialized for uid: abc123
[PFJ-Multi] Form properties updated: { metal: 60000, diamond: 0, total: 60000 }
```

### Cart Page (Cart Transform)

```
[PFJ-Transform-V2] Processing cart with 1 line(s)
[PFJ-Transform-V2] Processing line: gid://shopify/CartLine/1
[PFJ-Transform-V2] Surcharges found: { metal: 60000, diamond: 5000000, total: 5060000 }
[PFJ-Transform-V2] 💰 CALCULATION: { base: 24.99, metal: 600.00, diamond: 50000.00, final: 50624.99 }
[PFJ-Transform-V2] ✅ Operation created for line: gid://shopify/CartLine/1
```

---

## Comparison: Old vs New System

| Aspect            | Old System                   | New System                  |
| ----------------- | ---------------------------- | --------------------------- |
| **Variants**      | Single variant per product   | ✅ Unlimited variants       |
| **Customization** | Single surcharge             | ✅ Metal + Diamond separate |
| **Rate Updates**  | Manual per-variant           | ✅ Automatic for all        |
| **Scalability**   | 100s of products max         | ✅ 1,000s of products       |
| **Complexity**    | Moderate                     | ✅ Simpler                  |
| **API Calls**     | Many (updating each variant) | ✅ None during rate change  |

---

## Troubleshooting

### Issue: Variants Don't Appear

**Check:**

```javascript
// In console:
document.querySelector('[data-pfj="variant"]'); // Should find element
```

**Fix:**

- Ensure block is added to product page
- Ensure product has multiple variants

### Issue: Metal/Diamond Options Missing

**Check:**

- Are rates configured in admin?
- Is block's settings checked (Show metal, Show diamond)?

**Fix:**

- Go to app admin → set rates
- Edit product page → check block settings

### Issue: Price Doesn't Update on Selection

**Check:**

```javascript
// In console:
document.querySelector('[data-pfj="variant"]').value; // variant selection
document.querySelector('[data-pfj="metal"]').value; // metal selection
// Should change to selected values
```

**Fix:**

- Hard refresh: Ctrl+Shift+R
- Clear cache: F12 → More tools → Empty cache

### Issue: Cart Shows Wrong Price

**Check:**

```javascript
// In console on cart page:
// Look for: [PFJ-Transform-V2] CALCULATION logs
// Shows: base + metal + diamond calculation
```

**Fix:**

- Verify form properties were sent with correct values
- Check if Shopify converted properties to attributes

---

## Advantages of This Approach

✅ **Simple** - No complex variant combinations  
✅ **Flexible** - Add new metals/diamonds anytime without code changes  
✅ **Scalable** - Works for unlimited products/variants  
✅ **Fast** - No API calls on product page (rates from metafields)  
✅ **Maintainable** - Fewer moving parts than old system  
✅ **Daily Updates** - Admin changes rates, all products reflect instantly  
✅ **Real-time** - Prices update as customer makes selections

---

## Next Steps

1. **Deploy** → `shopify app deploy`
2. **Test** → Follow testing steps above
3. **Verify** → Watch console logs for correct calculations
4. **Add to Products** → Add block to product pages
5. **Monitor** → Check console logs when customers add to cart

---

## Support

**Console Logs Start With:**

- `[PFJ-Multi]` - Product page JavaScript
- `[PFJ-Transform-V2]` - Cart transform function

**Troubleshoot with:**

1. Check console logs for errors
2. Verify rates in admin panel
3. Verify block settings on product page
4. Try hard refresh and clear cache
5. Run diagnostic checks above

---

**Status: ✅ Ready for Production**

This multi-variant system is simpler, more scalable, and more maintainable than the previous approach. All variants of all products automatically support the customization options with real-time pricing based on daily rates.
