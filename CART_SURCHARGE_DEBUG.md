# 🔍 CART SURCHARGE NOT APPLYING - Debugging Guide

## The Problem

✅ Price display on product page: WORKING (shows ₹2,949)  
✅ Console logs on add to cart: Showing correctly  
❌ Cart display: Still showing base price (₹2,499)  
❌ Cart Transform: NOT applying surcharge

---

## IMMEDIATE DEBUG STEPS (Do These Now)

### Debug Step 1: Check if Properties Reach the Cart

1. Go to your **cart page**
2. Open **Dev Tools (F12)**
3. Go to **Network** tab
4. **Refresh the page**
5. Look for a request to `/cart.js` (should be one of the first)
6. Click on it
7. Go to **Response** tab
8. Search (Ctrl+F) for `_surcharge`

**What you're looking for:**

```json
{
  "items": [
    {
      "title": "Bloom Diamond Choker...",
      "price": 249900,
      "properties": {
        "Metal": "18K Gold",
        "Diamond": "Lab Grown Diamond",
        "_surcharge": "45000",  ← Looking for this line
        "_currency": "INR"
      }
    }
  ]
}
```

**Results:**

- ✅ **If you see `_surcharge: 45000`** → Properties ARE reaching cart, issue is Cart Transform
- ❌ **If you DON'T see it** → Properties not being sent/stored, issue is in form submission

---

### Debug Step 2: Check Console Output

While on the cart page, open console and run:

```javascript
debugPFJCart();
```

Look for output like:

```
📦 CART DEBUG INFO
Item 0: Bloom Diamond Choker...
Price: 249900 cents
Quantity: 1
Properties: {Metal: "18K Gold", Diamond: "Lab Grown Diamond", _surcharge: "45000", _currency: "INR"}
Has _surcharge? ✅ YES
_surcharge value: 45000
```

**If you see `✅ YES`** → Properties ARE in cart  
**If you see `❌ NO`** → Properties NOT in cart

---

## DIAGNOSIS & NEXT STEPS

### Scenario A: Properties ARE in cart (✅) but price not updated

**This means**: Cart Transform function isn't applying the surcharge

**Possible causes:**

1. Cart Transform function not registered
2. Cart Transform not reading the `_surcharge` attribute correctly
3. Cart Transform function not executing

**Next steps:**

1. Go to Shopify Admin → Settings → Apps and integrations
2. Click on **PFJ Price Engine**
3. Check if you see "Cart Transform" configuration
4. If not listed → Cart Transform didn't register, need to re-deploy

**Quick fix:**

```bash
cd d:\Suraj Sharma\projects\shopifyApp\PFJ-price-engine\pfj-pricing
shopify app dev clean
shopify app deploy
```

---

### Scenario B: Properties NOT in cart (❌)

**This means**: Form submission isn't working properly

**Possible causes:**

1. Form submission not being intercepted
2. FormData not being modified correctly
3. Theme's form handler overriding our code

**Next steps:**

1. Go to product page
2. Open Console
3. Select metal + diamond
4. **Right-click on product form → Inspect**
5. Look for hidden inputs:
   ```html
   <input type="hidden" name="properties[_surcharge]" value="45000" />
   <input type="hidden" name="properties[Metal]" value="18K Gold" />
   ```

**If hidden inputs ARE there:**

- Form is correct, issue is in network transmission
- Need to check theme's form submission handler

**If hidden inputs NOT there:**

- Form building code isn't running
- Likely: Liquid block not loaded or executing

---

## WHAT TO REPORT BACK

Please run the above steps and tell me:

1. **Debug Step 1 result**:
   - Did you find `_surcharge: 45000` in the cart.js response?
   - Copy the exact properties object you see

2. **Debug Step 2 result**:
   - What did `debugPFJCart()` output?
   - Did it show `✅ YES` or `❌ NO` for \_surcharge?

3. **Scenario A or B**:
   - Which scenario applies to you?

**With this info, I can tell you exactly what to fix!**

---

## TEMPORARY WORKAROUND (If Debugging Takes Time)

While we debug, use the **Storefront API approach** for guaranteed reliability.

Replace the fetch interception with direct Storefront API call. See: `CART_ATTRIBUTE_OPTIONS.js` → "Option A: Direct Storefront API"

---

## Quick Reference: Expected vs Actual

### Expected:

```
Product: ₹2,499
+ Metal (18K): ₹450
+ Diamond (Lab): ₹0
= TOTAL: ₹2,949 ✅

In Cart:
Line Item Price: ₹2,949 ✅
Breakdown shows surcharge ✅

In Checkout:
Subtotal: ₹2,949 ✅
```

### Actual (What you're seeing):

```
Product: ₹2,499
+ Metal (18K): ₹450
+ Diamond (Lab): ₹0
= Shows: ₹2,949 ✅

In Cart:
Line Item Price: ₹2,499 ❌ (no surcharge)
No breakdown ❌

In Checkout:
Subtotal: ₹2,499 ❌
```

---

## Run These Commands Now

### 1. Add debugging script to theme (temporary)

Copy content from: `DEBUG_CART_SCRIPT.liquid`

Go to: Shopify Admin → Online Store → Themes → Actions → Edit Code

In `theme.liquid` add before `</body>`:

```liquid
{% include 'debug-cart-script' %}
```

### 2. Test

1. Product page → Select metal/diamond
2. Add to cart
3. Go to cart page
4. Open console
5. Run: `debugPFJCart()`
6. **Report what you see**

---

**Ready to help fix it once you provide the debug info!**
