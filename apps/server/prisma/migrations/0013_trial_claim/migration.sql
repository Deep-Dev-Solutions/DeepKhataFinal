-- One trial per phone number. New table only: safe on existing data.
CREATE TABLE "TrialClaim" (
    "id" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialClaim_phoneNormalized_key" ON "TrialClaim"("phoneNormalized");

-- CreateIndex
CREATE INDEX "TrialClaim_businessId_idx" ON "TrialClaim"("businessId");

-- Backfill: every existing business with a Pakistani mobile number claims it
-- (oldest business wins a duplicate). Other formats are skipped, never guessed.
INSERT INTO "TrialClaim" ("id", "phoneNormalized", "businessId", "userId", "createdAt")
SELECT DISTINCT ON (norm)
       gen_random_uuid()::text, norm, "id", "ownerId", "createdAt"
FROM (
    SELECT b."id", b."ownerId", b."createdAt",
           CASE
               WHEN d ~ '^92[0-9]{10}$' THEN '+' || d
               WHEN d ~ '^03[0-9]{9}$' THEN '+92' || substr(d, 2)
               WHEN d ~ '^3[0-9]{9}$' THEN '+92' || d
           END AS norm
    FROM (
        SELECT "id", "ownerId", "createdAt",
               regexp_replace(regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g'), '^00', '') AS d
        FROM "Business"
    ) b
) c
WHERE norm IS NOT NULL
ORDER BY norm, "createdAt" ASC, "id" ASC
ON CONFLICT ("phoneNormalized") DO NOTHING;
