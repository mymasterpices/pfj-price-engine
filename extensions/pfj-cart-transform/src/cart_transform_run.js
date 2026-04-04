export function cartTransformRun(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const surchargeAttr = line.attribute;

    if (!surchargeAttr?.value) continue;

    const finalPrice = parseFloat(surchargeAttr.value);
    if (isNaN(finalPrice) || finalPrice <= 0) continue;

    operations.push({
      update: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: finalPrice.toFixed(2),
            },
          },
        },
      },
    });
  }

  return { operations };
}
