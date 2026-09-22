-- CreateIndex
CREATE UNIQUE INDEX "BudgetAllocation_budgetPeriodId_categoryId_key" ON "BudgetAllocation"("budgetPeriodId", "categoryId");
