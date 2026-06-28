# Deal Status Categorization Guide (Kora Backend)

This document outlines the architecture and business logic for deal state management, payment status categorization, timezone handling, and financial metrics calculation in the Kora system.

---

## 1. Core Status Concepts

In Kora, a deal's lifecycle and financial state are governed by three complementary status properties:

### A. Deal Stage (`DealStage`)
Represents the operational progress of the deal pipeline from negotiation to completion.
- `LEAD`: Initial contact or lead generation.
- `OUTREACH`: Initial outreach initiated.
- `NEGOTIATION`: Terms, deliverables, or pricing being negotiated.
- `PROPOSAL_SENT`: Formal proposal submitted to brand.
- `CONTRACT_SENT`: Contract sent for brand signing.
- `APPROVED`: Deal terms & contract approved.
- `IN_PROGRESS`: Deliverables currently being produced or published.
- `COMPLETED`: All deliverables completed and fulfilled.
- `LOST`: Opportunity lost during negotiation.
- `CANCELLED`: Deal cancelled prior to completion.

### B. Payment Status (`PaymentStatus`)
Represents the financial fulfillment state stored on the `Deal` model and updated automatically when payment events occur.
- `PENDING`: No payments received yet against the deal.
- `PARTIALLY_PAID`: Partial payment received (`0 < amountPaid < totalAmount`).
- `PAID`: Full deal amount settled (`amountPaid >= totalAmount`).
- `OVERDUE`: Payment is past due date and remaining balance exists.
- `REFUNDED`: Payment refunded.

### C. Display & Earnings Categorization (`EarningsDealStatus`)
Used across earnings reporting and dashboards to provide creators with clear, actionable financial insight:
- **`PAID`**: Deal value is fully settled (`amountPaid >= amount` or all linked invoices paid).
- **`OVERDUE`**: Payment is past due date with unpaid balance or linked overdue invoices.
- **`DELIVERED`**: Deal deliverables/stage are completed (`COMPLETED`), awaiting final payment settlement.
- **`PENDING`**: Active deal in progress, awaiting payment or fulfillment.

---

## 2. Dynamic Month & Timezone Calculations

- **User Timezone Integration**: Date boundaries (start of month, end of month, today) are computed dynamically using the user's configured `timezone` from `UserSettings` (e.g., `Asia/Kolkata`, `America/New_York`, fallback to `UTC`).
- **Unified Selected Month Data**: The top filter dropdown has been removed from the UI. The dashboard now automatically returns and aggregates all active deals associated with the selected month window.

---

## 3. Financial Metrics Calculation

All financial metrics on the Earnings Dashboard aggregate data for the selected month window.

### 1. Total Earned
- **Definition**: Sum of total actual payments received for deals matching the selected month.
- **Calculation**: Sum of `amountPaid` across deals in the selected month window.

### 2. Total Pending
- **Definition**: Sum of remaining unpaid amounts for deals in pending or delivered state.
- **Calculation**: Sum of `Math.max(0, deal.amount - deal.amountPaid)` for deals whose status is `PENDING` or `DELIVERED`.

### 3. Total Overdue
- **Definition**: Sum of remaining unpaid amounts for deals that are overdue.
- **Calculation**: Sum of `Math.max(0, deal.amount - deal.amountPaid)` for deals categorized as `OVERDUE`.

### 4. Avg. Deal Value
- **Definition**: Average contractual value of deals in the selected month window.
- **Calculation**: Total sum of deal values divided by total deal count.
