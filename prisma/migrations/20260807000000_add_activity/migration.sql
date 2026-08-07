-- CreateTable
CREATE TABLE "kbo"."Activity" (
    "id" TEXT NOT NULL,
    "entityNumber" TEXT NOT NULL,
    "activityGroupCode" TEXT NOT NULL,
    "naceVersion" TEXT NOT NULL,
    "naceCode" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "establishmentId" TEXT,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_naceCode_naceVersion_idx" ON "kbo"."Activity"("naceCode", "naceVersion");

-- CreateIndex
CREATE INDEX "Activity_naceCode_idx" ON "kbo"."Activity"("naceCode");

-- CreateIndex
CREATE INDEX "Activity_entityNumber_idx" ON "kbo"."Activity"("entityNumber");

-- CreateIndex
CREATE INDEX "Activity_enterpriseId_idx" ON "kbo"."Activity"("enterpriseId");

-- CreateIndex
CREATE INDEX "Activity_establishmentId_idx" ON "kbo"."Activity"("establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_entity_group_version_code_class" ON "kbo"."Activity"("entityNumber", "activityGroupCode", "naceVersion", "naceCode", "classification");

-- AddForeignKey
ALTER TABLE "kbo"."Activity" ADD CONSTRAINT "ActivityEnterprise" FOREIGN KEY ("enterpriseId") REFERENCES "kbo"."Enterprise"("enterpriseNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."Activity" ADD CONSTRAINT "ActivityEstablishment" FOREIGN KEY ("establishmentId") REFERENCES "kbo"."Establishment"("establishmentNumber") ON DELETE SET NULL ON UPDATE CASCADE;
