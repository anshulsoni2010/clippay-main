export const calculatePaymentAmount = (views: number, rpm: number) => {
  return Math.round(((views * rpm) / 1000) * 100) / 100
}

export const calculateServiceFee = (
  paymentAmount: number,
  referrerPayment: number = 0
) => {
  // Calculate service fee based on the actual payments after budget cap
  return Math.round((paymentAmount + referrerPayment) * 0.2 * 100) / 100
}

export const calculateTotalCost = (
  paymentAmount: number,
  referrerPayment: number = 0
) => {
  // Calculate total cost based on actual payments after budget cap
  const serviceFee = calculateServiceFee(paymentAmount, referrerPayment)
  return Math.round((paymentAmount + referrerPayment + serviceFee) * 100) / 100
}

export const isPaymentTooLow = (
  paymentAmount: number,
  totalCreatorEarnings: number
) => {
  // Individual submission must be at least $10 and total earnings must be at least $25
  return paymentAmount < 10 || totalCreatorEarnings < 25
}
