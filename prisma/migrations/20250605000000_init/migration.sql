CREATE SCHEMA IF NOT EXISTS "kbo";

-- CreateTable
CREATE TABLE "kbo"."Enterprise" (
    "enterpriseNumber" TEXT NOT NULL,
    "KBOstatusCode" TEXT NOT NULL,
    "juridicalSituationCode" TEXT NOT NULL,
    "typeOfEnterpriseCode" TEXT NOT NULL,
    "juridicalFormCode" TEXT,
    "juridicalFormCACCode" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enterprise_pkey" PRIMARY KEY ("enterpriseNumber")
);

-- CreateTable
CREATE TABLE "kbo"."Establishment" (
    "establishmentNumber" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "enterpriseNumber" TEXT NOT NULL,

    CONSTRAINT "Establishment_pkey" PRIMARY KEY ("establishmentNumber")
);

-- CreateTable
CREATE TABLE "kbo"."Denomination" (
    "id" TEXT NOT NULL,
    "entityNumber" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "typeOfDenominationCode" TEXT NOT NULL,
    "denomination" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "establishmentId" TEXT,

    CONSTRAINT "Denomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kbo"."KBOAddress" (
    "id" TEXT NOT NULL,
    "entityNumber" TEXT NOT NULL,
    "typeOfAddressCode" TEXT NOT NULL,
    "countryNL" TEXT,
    "countryFR" TEXT,
    "zipcode" TEXT,
    "municipalityNL" TEXT,
    "municipalityFR" TEXT,
    "streetNL" TEXT,
    "streetFR" TEXT,
    "houseNumber" TEXT,
    "box" TEXT,
    "extraAddressInfo" TEXT,
    "dateStrikingOff" TIMESTAMP(3),
    "enterpriseNumber" TEXT,
    "establishmentNumber" TEXT,

    CONSTRAINT "KBOAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kbo"."KBOContact" (
    "id" TEXT NOT NULL,
    "entityNumber" TEXT NOT NULL,
    "entityContactCode" TEXT NOT NULL,
    "conctactTypeCode" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "establishmentId" TEXT,

    CONSTRAINT "KBOContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kbo"."Branch" (
    "id" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "enterpriseNumber" TEXT NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kbo"."ContactType" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "ContactType_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "kbo"."EntityContact" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "EntityContact_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "kbo"."JuridicalForm" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "JuridicalForm_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "kbo"."JuridicalSituation" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "JuridicalSituation_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "kbo"."Language" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "kbo"."KBOStatus" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "KBOStatus_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "kbo"."TypeOfAddress" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "TypeOfAddress_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "kbo"."TypeOfDenomination" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "TypeOfDenomination_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "kbo"."TypeOfEnterprise" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "TypeOfEnterprise_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "Denomination_entityNumber_typeOfDenominationCode_languageCo_key" ON "kbo"."Denomination"("entityNumber", "typeOfDenominationCode", "languageCode");

-- CreateIndex
CREATE UNIQUE INDEX "KBOAddress_entityNumber_typeOfAddressCode_key" ON "kbo"."KBOAddress"("entityNumber", "typeOfAddressCode");

-- CreateIndex
CREATE UNIQUE INDEX "KBOContact_entityNumber_entityContactCode_conctactTypeCode_key" ON "kbo"."KBOContact"("entityNumber", "entityContactCode", "conctactTypeCode");

-- AddForeignKey
ALTER TABLE "kbo"."Enterprise" ADD CONSTRAINT "Enterprise_KBOstatusCode_fkey" FOREIGN KEY ("KBOstatusCode") REFERENCES "kbo"."KBOStatus"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."Enterprise" ADD CONSTRAINT "Enterprise_juridicalSituationCode_fkey" FOREIGN KEY ("juridicalSituationCode") REFERENCES "kbo"."JuridicalSituation"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."Enterprise" ADD CONSTRAINT "Enterprise_typeOfEnterpriseCode_fkey" FOREIGN KEY ("typeOfEnterpriseCode") REFERENCES "kbo"."TypeOfEnterprise"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."Enterprise" ADD CONSTRAINT "Enterprise_juridicalFormCode_fkey" FOREIGN KEY ("juridicalFormCode") REFERENCES "kbo"."JuridicalForm"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."Enterprise" ADD CONSTRAINT "Enterprise_juridicalFormCACCode_fkey" FOREIGN KEY ("juridicalFormCACCode") REFERENCES "kbo"."JuridicalForm"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."Establishment" ADD CONSTRAINT "Establishment_enterpriseNumber_fkey" FOREIGN KEY ("enterpriseNumber") REFERENCES "kbo"."Enterprise"("enterpriseNumber") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."Denomination" ADD CONSTRAINT "Denomination_languageCode_fkey" FOREIGN KEY ("languageCode") REFERENCES "kbo"."Language"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."Denomination" ADD CONSTRAINT "Denomination_typeOfDenominationCode_fkey" FOREIGN KEY ("typeOfDenominationCode") REFERENCES "kbo"."TypeOfDenomination"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."Denomination" ADD CONSTRAINT "DenominationEntreprise" FOREIGN KEY ("enterpriseId") REFERENCES "kbo"."Enterprise"("enterpriseNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."Denomination" ADD CONSTRAINT "DenominationEstablishment" FOREIGN KEY ("establishmentId") REFERENCES "kbo"."Establishment"("establishmentNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."KBOAddress" ADD CONSTRAINT "KBOAddress_typeOfAddressCode_fkey" FOREIGN KEY ("typeOfAddressCode") REFERENCES "kbo"."TypeOfAddress"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."KBOAddress" ADD CONSTRAINT "AddressEntreprise" FOREIGN KEY ("enterpriseNumber") REFERENCES "kbo"."Enterprise"("enterpriseNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."KBOAddress" ADD CONSTRAINT "AddressEstablishment" FOREIGN KEY ("establishmentNumber") REFERENCES "kbo"."Establishment"("establishmentNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."KBOContact" ADD CONSTRAINT "KBOContact_entityContactCode_fkey" FOREIGN KEY ("entityContactCode") REFERENCES "kbo"."EntityContact"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."KBOContact" ADD CONSTRAINT "KBOContact_conctactTypeCode_fkey" FOREIGN KEY ("conctactTypeCode") REFERENCES "kbo"."ContactType"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."KBOContact" ADD CONSTRAINT "KBOContactEntreprise" FOREIGN KEY ("enterpriseId") REFERENCES "kbo"."Enterprise"("enterpriseNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."KBOContact" ADD CONSTRAINT "KBOContactEstablishment" FOREIGN KEY ("establishmentId") REFERENCES "kbo"."Establishment"("establishmentNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kbo"."Branch" ADD CONSTRAINT "Branch_enterpriseNumber_fkey" FOREIGN KEY ("enterpriseNumber") REFERENCES "kbo"."Enterprise"("enterpriseNumber") ON DELETE RESTRICT ON UPDATE CASCADE;
