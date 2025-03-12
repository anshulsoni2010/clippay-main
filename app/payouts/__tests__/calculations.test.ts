import {
  calculatePaymentAmount,
  calculateServiceFee,
  calculateTotalCost,
  isPaymentTooLow,
} from "../calculations"

describe("Payment Calculations", () => {
  describe("Creator and Referrer Payments", () => {
    it("should calculate correct payments when budget is sufficient", () => {
      const views = 72153
      const rpm = 0.65
      const referralBonusRate = 0.65
      const budgetPool = 100.0
      const remainingBudget = 100.0

      // Calculate initial payments
      const initialCreatorPayment = calculatePaymentAmount(views, rpm)
      expect(initialCreatorPayment).toBe(46.9)

      // Cap creator payment based on budget
      const cappedCreatorPayment = Math.min(
        initialCreatorPayment,
        remainingBudget
      )
      expect(cappedCreatorPayment).toBe(46.9)

      // Calculate and cap referrer payment
      const initialReferrerPayment = calculatePaymentAmount(
        views,
        referralBonusRate
      )
      const cappedReferrerPayment = Math.min(
        initialReferrerPayment,
        Math.max(0, remainingBudget - cappedCreatorPayment)
      )
      expect(cappedReferrerPayment).toBe(46.9)

      // Calculate service fee
      const serviceFee = calculateServiceFee(
        cappedCreatorPayment,
        cappedReferrerPayment
      )
      expect(serviceFee).toBe(18.76)

      // Calculate total cost
      const totalCost = calculateTotalCost(
        cappedCreatorPayment,
        cappedReferrerPayment
      )
      expect(totalCost).toBe(112.56)

      // Calculate remaining budget
      const totalNeeded = cappedCreatorPayment + cappedReferrerPayment
      const remainingAfterPayment = Number(
        (remainingBudget - totalNeeded).toFixed(2)
      )
      expect(remainingAfterPayment).toBe(6.2)
    })

    it("should cap payments when budget is insufficient", () => {
      const views = 72153
      const rpm = 0.65
      const referralBonusRate = 0.65
      const budgetPool = 80.0
      const remainingBudget = 44.19

      // Calculate initial payments
      const initialCreatorPayment = calculatePaymentAmount(views, rpm)
      expect(initialCreatorPayment).toBe(46.9)

      // Cap creator payment based on remaining budget
      const cappedCreatorPayment = Math.min(
        initialCreatorPayment,
        remainingBudget
      )
      expect(cappedCreatorPayment).toBe(44.19)

      // Calculate and cap referrer payment
      const initialReferrerPayment = calculatePaymentAmount(
        views,
        referralBonusRate
      )
      const cappedReferrerPayment = Math.min(
        initialReferrerPayment,
        Math.max(0, remainingBudget - cappedCreatorPayment)
      )
      expect(cappedReferrerPayment).toBe(0)

      // Calculate service fee
      const serviceFee = calculateServiceFee(
        cappedCreatorPayment,
        cappedReferrerPayment
      )
      expect(serviceFee).toBe(8.84)

      // Calculate total cost
      const totalCost = calculateTotalCost(
        cappedCreatorPayment,
        cappedReferrerPayment
      )
      expect(totalCost).toBe(53.03)

      // Calculate remaining budget
      const totalNeeded = cappedCreatorPayment + cappedReferrerPayment
      const remainingAfterPayment = Number(
        (remainingBudget - totalNeeded).toFixed(2)
      )
      expect(remainingAfterPayment).toBe(0)
    })

    it("should handle case with no referrer payment", () => {
      const views = 72153
      const rpm = 0.65
      const budgetPool = 80.0
      const remainingBudget = 44.19

      // Calculate initial payments
      const initialCreatorPayment = calculatePaymentAmount(views, rpm)
      expect(initialCreatorPayment).toBe(46.9)

      // Cap creator payment based on remaining budget
      const cappedCreatorPayment = Math.min(
        initialCreatorPayment,
        remainingBudget
      )
      expect(cappedCreatorPayment).toBe(44.19)

      // No referrer payment
      const cappedReferrerPayment = 0

      // Calculate service fee
      const serviceFee = calculateServiceFee(
        cappedCreatorPayment,
        cappedReferrerPayment
      )
      expect(serviceFee).toBe(8.84)

      // Calculate total cost
      const totalCost = calculateTotalCost(
        cappedCreatorPayment,
        cappedReferrerPayment
      )
      expect(totalCost).toBe(53.03)

      // Calculate remaining budget
      const totalNeeded = cappedCreatorPayment + cappedReferrerPayment
      const remainingAfterPayment = Number(
        (remainingBudget - totalNeeded).toFixed(2)
      )
      expect(remainingAfterPayment).toBe(0)
    })
  })

  describe("Edge Cases", () => {
    it("should handle zero views", () => {
      const views = 0
      const rpm = 0.65
      const payment = calculatePaymentAmount(views, rpm)
      expect(payment).toBe(0)
    })

    it("should handle zero RPM", () => {
      const views = 72153
      const rpm = 0
      const payment = calculatePaymentAmount(views, rpm)
      expect(payment).toBe(0)
    })

    it("should handle zero budget", () => {
      const views = 72153
      const rpm = 0.65
      const budgetPool = 0
      const remainingBudget = 0

      const initialPayment = calculatePaymentAmount(views, rpm)
      const cappedPayment = Math.min(initialPayment, remainingBudget)
      expect(cappedPayment).toBe(0)
    })

    it("should round payments correctly", () => {
      const views = 72153
      const rpm = 0.654321 // More decimal places
      const payment = calculatePaymentAmount(views, rpm)
      expect(payment.toString()).toMatch(/^\d+\.\d{2}$/) // Should have exactly 2 decimal places
    })
  })

  describe("Payment Thresholds", () => {
    it("should identify payments that are too low", () => {
      expect(isPaymentTooLow(9.99, 25)).toBe(true) // Individual payment too low
      expect(isPaymentTooLow(10, 24.99)).toBe(true) // Total earnings too low
      expect(isPaymentTooLow(10, 25)).toBe(false) // Both meet thresholds
      expect(isPaymentTooLow(100, 100)).toBe(false) // Well above thresholds
    })
  })
})
