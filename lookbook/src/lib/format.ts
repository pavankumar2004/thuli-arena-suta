const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })

/** ₹3,895 */
export const formatPrice = (n: number) => inr.format(n)
