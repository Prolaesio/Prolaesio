-- Reviewed jurisdiction policies and conservative Lodario fallback.
-- Additive migration: earlier Guardian migrations are intentionally unchanged.
-- A configured digital-consent rule is not a complete legal basis assessment,
-- particularly for wellness, pain, injury, or other health-related information.

CREATE TABLE IF NOT EXISTS public.iso_country_codes (
  country_code TEXT PRIMARY KEY CHECK (country_code ~ '^[A-Z]{2}$')
);

INSERT INTO public.iso_country_codes(country_code)
SELECT unnest(ARRAY[
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
  'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
  'DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR',
  'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
  'HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT',
  'JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
  'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
  'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM',
  'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA',
  'RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
  'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
  'UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW'
]::TEXT[])
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.guardian_jurisdiction_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  subdivision_code TEXT,
  parent_policy_id UUID REFERENCES public.guardian_jurisdiction_policies(id) ON DELETE SET NULL,
  jurisdiction_name TEXT NOT NULL,
  jurisdiction_level TEXT NOT NULL CHECK (jurisdiction_level IN ('country','federal','state','province','territory','fallback')),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('fixed_age','capacity_based','federal_with_local_overrides','lodario_fallback')),
  guardian_required_below_age INTEGER CHECK (guardian_required_below_age BETWEEN 1 AND 20),
  secondary_guardian_age INTEGER CHECK (secondary_guardian_age BETWEEN 1 AND 20),
  capacity_assessment_required BOOLEAN NOT NULL DEFAULT FALSE,
  consent_basis_scope TEXT NOT NULL CHECK (consent_basis_scope IN (
    'information_society_service_consent','coppa_covered_processing','meaningful_consent',
    'privacy_capacity_guidance','lodario_product_safety'
  )),
  guardian_requirement_mode TEXT NOT NULL CHECK (guardian_requirement_mode IN (
    'legal_threshold','regulator_guidance_operational_threshold','case_by_case_capacity','lodario_safety_fallback'
  )),
  policy_status TEXT NOT NULL CHECK (policy_status IN ('reviewed','pending_review','unreviewed','disabled','superseded')),
  policy_version TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_until DATE,
  reviewed_at DATE,
  review_due_at DATE,
  source_checked_at DATE,
  source_authority TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  legal_review_status TEXT NOT NULL CHECK (legal_review_status IN (
    'authoritative_source_reviewed','legal_counsel_approved','pending_legal_review','not_reviewed'
  )),
  internal_notes TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (country_code = 'ZZ' OR country_code ~ '^[A-Z]{2}$'),
  CHECK (subdivision_code IS NULL OR subdivision_code ~ '^[A-Z0-9]{1,3}$'),
  CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CHECK (review_due_at IS NULL OR reviewed_at IS NULL OR review_due_at >= reviewed_at),
  CHECK (
    policy_status <> 'reviewed'
    OR (rule_type = 'fixed_age' AND guardian_required_below_age IS NOT NULL)
    OR (rule_type = 'federal_with_local_overrides' AND guardian_required_below_age IS NOT NULL)
    OR (rule_type = 'capacity_based' AND (secondary_guardian_age IS NOT NULL OR capacity_assessment_required))
    OR (rule_type = 'lodario_fallback' AND country_code = 'ZZ')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS guardian_jurisdiction_policy_version_idx
  ON public.guardian_jurisdiction_policies(country_code, coalesce(subdivision_code,''), policy_version);
CREATE INDEX IF NOT EXISTS guardian_jurisdiction_policy_lookup_idx
  ON public.guardian_jurisdiction_policies(country_code, subdivision_code, policy_status, effective_from DESC, effective_until);
CREATE INDEX IF NOT EXISTS guardian_jurisdiction_policy_review_idx
  ON public.guardian_jurisdiction_policies(policy_status, legal_review_status, review_due_at);

INSERT INTO public.guardian_jurisdiction_policies(
  country_code, jurisdiction_name, jurisdiction_level, rule_type,
  guardian_required_below_age, secondary_guardian_age, capacity_assessment_required,
  consent_basis_scope, guardian_requirement_mode, policy_status, policy_version,
  effective_from, reviewed_at, review_due_at, source_checked_at,
  source_authority, source_reference, legal_review_status, internal_notes, metadata
) VALUES
  (
    'ZZ','Lodario conservative fallback','fallback','lodario_fallback',13,18,FALSE,
    'lodario_product_safety','lodario_safety_fallback','reviewed','lodario-fallback-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Lodario product policy',
    'Internal Guardian safety policy; not presented as jurisdiction-specific law.',
    'authoritative_source_reviewed',
    'Under 13 requires approval and restriction; ages 13-17 require a connection without restriction; 18+ skips Guardian onboarding.',
    '{"isFallback":true,"legalClaim":false}'::JSONB
  ),
  (
    'PT','Portugal','country','fixed_age',13,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','pt-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Comissão Nacional de Proteção de Dados / Portuguese Law 58/2019',
    'https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982 — Article 16; regulator context: https://www.cnpd.pt/cidadaos/direitos/',
    'authoritative_source_reviewed',
    'Article 8 implementation for consent-based information-society services. This does not settle lawful basis or health-data requirements.',
    '{"article":"Law 58/2019 Article 16"}'::JSONB
  ),
  (
    'FR','France','country','fixed_age',15,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','fr-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Commission nationale de l’informatique et des libertés (CNIL)',
    'https://www.cnil.fr/fr/le-cadre-national/la-loi-informatique-et-libertes — Article 45',
    'authoritative_source_reviewed',
    'French Article 45 uses age 15 and joint child/parent consent below 15 for applicable online-service consent processing.',
    '{"article":"Loi Informatique et Libertés Article 45"}'::JSONB
  ),
  (
    'IE','Ireland','country','fixed_age',16,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','ie-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Data Protection Commission Ireland',
    'https://www.dataprotection.ie/en/dpc-guidance/children-parents-and-data-protection-can-i-make-complaint-behalf-my-child',
    'authoritative_source_reviewed',
    'Ireland retains 16 for Article 8 digital consent. DPC guidance stresses this applies when the online service relies on consent.',
    '{"article":"Data Protection Act 2018 section 31 / GDPR Article 8"}'::JSONB
  ),
  (
    'GB','United Kingdom','country','fixed_age',13,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','gb-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Information Commissioner’s Office',
    'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr-old/what-are-the-rules-about-an-iss-and-consent/',
    'authoritative_source_reviewed',
    'UK GDPR Article 8 threshold for consent-based ISS processing. Does not apply automatically to Crown Dependencies or Overseas Territories.',
    '{"territoriesInherited":false}'::JSONB
  ),
  (
    'US','United States — federal','federal','federal_with_local_overrides',13,NULL,FALSE,
    'coppa_covered_processing','legal_threshold','reviewed','us-coppa-federal-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'United States Federal Trade Commission',
    'https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa — 16 CFR Part 312',
    'authoritative_source_reviewed',
    'COPPA applies to covered child-directed services and general-audience services with actual knowledge. State overrides are supported by subdivision rows but none are active.',
    '{"supportsSubdivisionOverrides":true,"federalLaw":"15 USC 6501-6505"}'::JSONB
  ),
  (
    'CA','Canada — federal guidance','federal','capacity_based',NULL,13,TRUE,
    'meaningful_consent','regulator_guidance_operational_threshold','reviewed','ca-opc-capacity-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Office of the Privacy Commissioner of Canada',
    'https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_consent/',
    'authoritative_source_reviewed',
    'Not a universal statutory age. OPC says under-13 users are unable to provide meaningful consent in all but exceptional circumstances; Lodario uses 13 operationally. Provincial overrides remain possible.',
    '{"supportsSubdivisionOverrides":true,"legalRule":"capacity","operationalThreshold":13}'::JSONB
  ),
  (
    'AU','Australia — federal guidance','federal','capacity_based',NULL,16,TRUE,
    'privacy_capacity_guidance','regulator_guidance_operational_threshold','reviewed','au-oaic-capacity-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Office of the Australian Information Commissioner',
    'https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/children-and-young-people',
    'authoritative_source_reviewed',
    'Privacy Act has no fixed age and capacity is case-by-case. OAIC says an organisation may generally assume capacity over age 15 when individual assessment is impractical. Lodario therefore requires a Guardian below 16 as its operational implementation.',
    '{"supportsSubdivisionOverrides":true,"legalRule":"capacity","operationalThreshold":16,"oaicWording":"over age 15"}'::JSONB
  )
ON CONFLICT DO NOTHING;

-- Priority jurisdictions not confidently activated remain pending and therefore use the fallback.
INSERT INTO public.guardian_jurisdiction_policies(
  country_code, jurisdiction_name, jurisdiction_level, rule_type,
  guardian_required_below_age, secondary_guardian_age, capacity_assessment_required,
  consent_basis_scope, guardian_requirement_mode, policy_status, policy_version,
  effective_from, source_checked_at, source_authority, source_reference,
  legal_review_status, internal_notes
) VALUES
  ('AT','Austria','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','at-pending-2026-07','2026-07-23','2026-07-23','Austrian Data Protection Authority — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('BE','Belgium','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','be-pending-2026-07','2026-07-23','2026-07-23','Belgian Data Protection Authority — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('BG','Bulgaria','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','bg-pending-2026-07','2026-07-23','2026-07-23','Bulgarian CPDP — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('HR','Croatia','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','hr-pending-2026-07','2026-07-23','2026-07-23','Croatian Personal Data Protection Agency — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('CY','Cyprus','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','cy-pending-2026-07','2026-07-23','2026-07-23','Cyprus Commissioner for Personal Data Protection — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('CZ','Czechia','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','cz-pending-2026-07','2026-07-23','2026-07-23','Czech Office for Personal Data Protection — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('DK','Denmark','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','dk-pending-2026-07','2026-07-23','2026-07-23','Danish Data Protection Agency — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('EE','Estonia','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','ee-pending-2026-07','2026-07-23','2026-07-23','Estonian Data Protection Inspectorate — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('FI','Finland','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','fi-pending-2026-07','2026-07-23','2026-07-23','Finnish Data Protection Ombudsman — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('DE','Germany','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','de-pending-2026-07','2026-07-23','2026-07-23','Federal Commissioner for Data Protection and Freedom of Information — verification pending','Absence of a lower national Article 8 threshold must be confirmed against current national law.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('GR','Greece','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','gr-pending-2026-07','2026-07-23','2026-07-23','Hellenic Data Protection Authority — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('HU','Hungary','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','hu-pending-2026-07','2026-07-23','2026-07-23','Hungarian NAIH — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('IT','Italy','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','it-pending-2026-07','2026-07-23','2026-07-23','Italian Data Protection Authority — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('LV','Latvia','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','lv-pending-2026-07','2026-07-23','2026-07-23','Latvian Data State Inspectorate — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('LT','Lithuania','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','lt-pending-2026-07','2026-07-23','2026-07-23','Lithuanian State Data Protection Inspectorate — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('LU','Luxembourg','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','lu-pending-2026-07','2026-07-23','2026-07-23','Luxembourg CNPD — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('MT','Malta','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','mt-pending-2026-07','2026-07-23','2026-07-23','Malta IDPC — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('NL','Netherlands','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','nl-pending-2026-07','2026-07-23','2026-07-23','Dutch Data Protection Authority — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('PL','Poland','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','pl-pending-2026-07','2026-07-23','2026-07-23','Polish UODO — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('RO','Romania','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','ro-pending-2026-07','2026-07-23','2026-07-23','Romanian ANSPDCP — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('SK','Slovakia','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','sk-pending-2026-07','2026-07-23','2026-07-23','Slovak Office for Personal Data Protection — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('SI','Slovenia','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','si-pending-2026-07','2026-07-23','2026-07-23','Slovenian Information Commissioner — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('ES','Spain','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','es-pending-2026-07','2026-07-23','2026-07-23','Spanish Data Protection Agency — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('SE','Sweden','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','se-pending-2026-07','2026-07-23','2026-07-23','Swedish Authority for Privacy Protection — verification pending','National implementing law and current regulator guidance must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('NO','Norway','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','no-pending-2026-07','2026-07-23','2026-07-23','Norwegian Data Protection Authority — verification pending','EEA implementation and current national threshold must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('IS','Iceland','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','is-pending-2026-07','2026-07-23','2026-07-23','Icelandic Data Protection Authority — verification pending','EEA implementation and current national threshold must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('LI','Liechtenstein','country','fixed_age',NULL,NULL,FALSE,'information_society_service_consent','legal_threshold','pending_review','li-pending-2026-07','2026-07-23','2026-07-23','Liechtenstein Data Protection Authority — verification pending','EEA implementation and current national threshold must be confirmed.','pending_legal_review','Fallback applies until verified; no threshold is asserted.'),
  ('NZ','New Zealand','country','capacity_based',NULL,NULL,TRUE,'meaningful_consent','case_by_case_capacity','pending_review','nz-pending-2026-07','2026-07-23','2026-07-23','Office of the Privacy Commissioner New Zealand — verification pending','No sufficiently clear official fixed implementation threshold verified.','pending_legal_review','Fallback applies; do not invent a fixed legal age.'),
  ('CH','Switzerland','country','capacity_based',NULL,NULL,TRUE,'privacy_capacity_guidance','case_by_case_capacity','pending_review','ch-pending-2026-07','2026-07-23','2026-07-23','Swiss Federal Data Protection and Information Commissioner — verification pending','Capacity of judgement is context-specific; no sufficiently clear data-protection age threshold verified.','pending_legal_review','Fallback applies; do not invent a fixed legal age.')
ON CONFLICT DO NOTHING;

-- Second-pass authoritative review. effective_from is Lodario's operational
-- activation date; the cited national rules generally predate that date.
INSERT INTO public.guardian_jurisdiction_policies(
  country_code, jurisdiction_name, jurisdiction_level, rule_type,
  guardian_required_below_age, secondary_guardian_age, capacity_assessment_required,
  consent_basis_scope, guardian_requirement_mode, policy_status, policy_version,
  effective_from, reviewed_at, review_due_at, source_checked_at,
  source_authority, source_reference, legal_review_status, internal_notes, metadata
) VALUES
  ('AT','Austria','country','fixed_age',14,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','at-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Österreichische Datenschutzbehörde',
    'https://dsb.gv.at/ueber-die-datenschutzbehoerde/teens-kids — GDPR Article 8 and Austrian DSG section 4(4)',
    'authoritative_source_reviewed',
    'For consent-based information-society services offered directly to children, parental authorisation is required below 14.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('BE','Belgium','country','fixed_age',13,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','be-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Belgian Data Protection Authority',
    'https://www.dataprotectionauthority.be/professionnel/rgpd-/bases-juridiques/consentement — Act of 30 July 2018 Article 7',
    'authoritative_source_reviewed',
    'The Belgian authority states that a child may consent from 13 for applicable information-society services.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('BG','Bulgaria','country','fixed_age',14,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','bg-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Commission for Personal Data Protection Bulgaria',
    'https://cpdp.bg/home-default/полезна-информация/правата-на-децата-и-младите-хора-при-ра/ — Personal Data Protection Act Article 25c',
    'authoritative_source_reviewed',
    'The Bulgarian authority states that valid child consent for directly offered information-society services begins at 14.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('HR','Croatia','country','fixed_age',16,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','hr-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Croatian Personal Data Protection Agency',
    'https://azop.hr/national-legislation/ — Act implementing GDPR Article 19',
    'authoritative_source_reviewed',
    'Article 19 retains 16 for children with permanent residence in Croatia when the applicable processing relies on consent.',
    '{"operationalEffectiveDate":true,"residenceQualifier":"permanent residence"}'::JSONB),
  ('CY','Cyprus','country','fixed_age',14,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','cy-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Republic of Cyprus / Commissioner for Personal Data Protection',
    'https://www.gov.cy/media/sites/175/2026/01/Law-125I-of-2018-ENG-final.pdf — Law 125(I)/2018 section 8',
    'authoritative_source_reviewed',
    'Section 8 permits consent-based processing for a directly offered information-society service from age 14.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('CZ','Czechia','country','fixed_age',15,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','cz-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Czech Office for Personal Data Protection',
    'https://uoou.gov.cz/media/act-no-110-2019-coll.pdf — Act No. 110/2019 Coll., section 7',
    'authoritative_source_reviewed',
    'The Czech implementing act gives a child capacity for this consent from age 15.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('DK','Denmark','country','fixed_age',13,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','dk-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Danish Data Protection Agency',
    'https://www.datatilsynet.dk/regler-og-vejledning/myter-om-gdpr — Danish Data Protection Act section 6(2)',
    'authoritative_source_reviewed',
    'The Danish authority identifies 13 as the national information-society-service consent threshold.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('EE','Estonia','country','fixed_age',13,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','ee-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Riigi Teataja — Estonian official legal publication',
    'https://www.riigiteataja.ee/en/eli/507112023002/consolide — Personal Data Protection Act section 8',
    'authoritative_source_reviewed',
    'Section 8 permits applicable consent-based processing for directly offered information-society services from age 13.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('FI','Finland','country','fixed_age',13,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','fi-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Finlex — Finnish Ministry of Justice legal database',
    'https://finlex.fi/en/legislation/translations/2018/eng/1050 — Data Protection Act section 5',
    'authoritative_source_reviewed',
    'Section 5 sets 13 for applicable consent-based information-society services offered directly to a child.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('DE','Germany','country','fixed_age',16,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','de-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Federal Commissioner for Data Protection and Freedom of Information',
    'https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Broschueren/INFO1.pdf — GDPR Article 8 in Germany',
    'authoritative_source_reviewed',
    'BfDI guidance confirms that a child consent for an information-society service is effective from 16 in Germany.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('GR','Greece','country','fixed_age',15,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','gr-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Hellenic Data Protection Authority',
    'https://www.dpa.gr/el/polites/prostasia — Law 4624/2019 Article 21',
    'authoritative_source_reviewed',
    'The Greek authority states that applicable consent is valid from age 15 and needs legal-representative consent below 15.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('HU','Hungary','country','fixed_age',16,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','hu-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Hungarian National Authority for Data Protection and Freedom of Information',
    'https://naih.hu/files/handbook_the_gdpr_made_simpler_for%20smes_eng.pdf — GDPR Article 8 national guidance',
    'authoritative_source_reviewed',
    'Hungary has not lowered the Article 8 threshold; official NAIH guidance uses 16.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('IT','Italy','country','fixed_age',14,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','it-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Italian Data Protection Authority',
    'https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9536089 — Privacy Code Article 2-quinquies',
    'authoritative_source_reviewed',
    'The Italian authority confirms age 14 for consent-based information-society services offered directly to minors.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('LV','Latvia','country','fixed_age',13,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','lv-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Latvian Data State Inspectorate',
    'https://www.dvi.gov.lv/lv/media/1517/download — official guidance on child consent for information-society services',
    'authoritative_source_reviewed',
    'The Latvian authority guidance requires parental consent below 13 for directly offered information-society services.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('LT','Lithuania','country','fixed_age',14,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','lt-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Seimas of the Republic of Lithuania / State Data Protection Inspectorate',
    'https://e-seimas.lrs.lt/rs/legalact/TAD/3e1ba58238c711edbf47f0036855e731/ — Law on Legal Protection of Personal Data Article 6',
    'authoritative_source_reviewed',
    'The consolidated official text states that the child must be at least 14 for the applicable consent.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('LU','Luxembourg','country','fixed_age',16,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','lu-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Luxembourg National Commission for Data Protection',
    'https://cnpd.public.lu/en/professionnels/obligations/liceite/consentement.html — child consent guidance',
    'authoritative_source_reviewed',
    'Current CNPD guidance requires parent or legal-guardian consent for children under 16.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('MT','Malta','country','fixed_age',13,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','mt-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Malta Information and Data Protection Commissioner',
    'https://idpc.org.mt/our-office/legislation/ — Subsidiary Legislation 586.11',
    'authoritative_source_reviewed',
    'The Maltese regulations lower the Article 8 age to 13.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('NL','Netherlands','country','fixed_age',16,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','nl-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Government of the Netherlands — official legislation database',
    'https://wetten.overheid.nl/BWBR0040940/2021-07-01 — GDPR Implementation Act Article 5',
    'authoritative_source_reviewed',
    'The Netherlands retains 16; official government guidance confirms no informal 13-year legal threshold.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('PL','Poland','country','fixed_age',16,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','pl-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Polish Personal Data Protection Office',
    'https://uodo.gov.pl/en/680/1395 — official guidance on children using information-society services',
    'authoritative_source_reviewed',
    'UODO states that a parent or legal guardian decides the consent for a person under 16 using these services.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('RO','Romania','country','fixed_age',16,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','ro-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Romanian National Supervisory Authority for Personal Data Processing',
    'https://www.dataprotection.ro/index.jsp?lang=en&page=IntrebariFrecvente1 — FAQ question 17',
    'authoritative_source_reviewed',
    'The Romanian authority states that the applicable processing is independently lawful from age 16.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('SK','Slovakia','country','fixed_age',16,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','sk-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Office for Personal Data Protection of the Slovak Republic',
    'https://dataprotection.gov.sk/en/legislation/guidelines-faq/frequently-asked-questions-faq/ — child consent FAQ',
    'authoritative_source_reviewed',
    'The Slovak authority requires parent or legal-representative authorisation below age 16 for applicable services.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('SI','Slovenia','country','fixed_age',15,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','si-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Information Commissioner of the Republic of Slovenia',
    'https://www.ip-rs.si/?id=102 — ZVOP-2 Article 8 child consent guidance',
    'authoritative_source_reviewed',
    'ZVOP-2 provides that consent for directly offered or foreseeably child-used information-society services is valid from 15.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('ES','Spain','country','fixed_age',14,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','es-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Spanish Data Protection Agency',
    'https://www.aepd.es/preguntas-frecuentes/10-menores-y-educacion/FAQ-1001-cual-es-la-edad-para-que-los-menores-puedan-prestar-consentimiento-para-tratar-sus-datos-personales — Organic Law 3/2018 Article 7',
    'authoritative_source_reviewed',
    'AEPD confirms independent consent from age 14 and parent or guardian consent below 14.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('SE','Sweden','country','fixed_age',13,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','se-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Swedish Authority for Privacy Protection',
    'https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/samtycke/ — child consent guidance',
    'authoritative_source_reviewed',
    'IMY states that commercial information-society services may be offered on the child consent basis from age 13.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('NO','Norway','country','fixed_age',13,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','no-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Norwegian Data Protection Authority',
    'https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/om-behandlingsgrunnlag/samtykke/ — Personal Data Act section 5',
    'authoritative_source_reviewed',
    'Current authority guidance requires parental consent below 13 where the service is child-directed and consent is the legal basis.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('IS','Iceland','country','fixed_age',13,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','is-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Icelandic Data Protection Authority',
    'https://www.personuvernd.is/media/uncategorized/Act_No_90_2018_on_Data_Protection_and_the_Processing_of_Personal_Data.pdf — Act 90/2018 Article 10',
    'authoritative_source_reviewed',
    'The Icelandic act permits the applicable child consent from age 13.',
    '{"operationalEffectiveDate":true}'::JSONB),
  ('LI','Liechtenstein','country','fixed_age',16,NULL,FALSE,
    'information_society_service_consent','legal_threshold','reviewed','li-iss-consent-2026-07',
    '2026-07-23','2026-07-23','2027-01-23','2026-07-23',
    'Liechtenstein Data Protection Authority',
    'https://www.datenschutzstelle.li/datenschutz/fuer-buergerinnen-und-buerger — child protection under GDPR',
    'authoritative_source_reviewed',
    'The Liechtenstein authority states that a child consent for a directly offered information-society service is effective from 16.',
    '{"operationalEffectiveDate":true}'::JSONB)
ON CONFLICT DO NOTHING;

UPDATE public.guardian_jurisdiction_policies
SET policy_status='superseded',
    internal_notes=internal_notes||' Superseded in this migration after authoritative-source review.',
    updated_at=now()
WHERE policy_status='pending_review'
  AND policy_version LIKE '%-pending-2026-07'
  AND country_code IN (
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','DE','GR','HU',
    'IT','LV','LT','LU','MT','NL','PL','RO','SK','SI','ES','SE',
    'NO','IS','LI'
  );

CREATE TABLE IF NOT EXISTS public.guardian_policy_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.guardian_jurisdiction_policies(id) ON DELETE RESTRICT,
  previous_policy_id UUID REFERENCES public.guardian_jurisdiction_policies(id) ON DELETE SET NULL,
  country_code TEXT NOT NULL,
  age_at_evaluation INTEGER NOT NULL,
  decision JSONB NOT NULL,
  decision_hash BYTEA NOT NULL,
  reason TEXT NOT NULL,
  application_mode TEXT NOT NULL CHECK (application_mode IN ('initial_onboarding','birthday_transition','policy_reconciliation','dob_correction','admin_rollout')),
  enforcement_status TEXT NOT NULL CHECK (enforcement_status IN ('applied','grace_period','pending_admin_rollout','not_required')),
  grace_ends_at TIMESTAMPTZ,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guardian_policy_decision_player_idx ON public.guardian_policy_decisions(player_user_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS guardian_policy_decision_policy_idx ON public.guardian_policy_decisions(policy_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS public.player_policy_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('policy_changed','guardian_now_required','guardian_no_longer_required','grace_period_started','age_transition')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  policy_decision_id UUID REFERENCES public.guardian_policy_decisions(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_policy_notification_idx ON public.player_policy_notifications(player_user_id, is_read, created_at DESC);

ALTER TABLE public.player_age_identities
  ADD COLUMN IF NOT EXISTS jurisdiction_policy_id UUID REFERENCES public.guardian_jurisdiction_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guardian_connection_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS policy_status TEXT NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_policy_decision JSONB NOT NULL DEFAULT '{}'::JSONB;

INSERT INTO public.guardian_feature_flags(flag_key,enabled,description,rollout_percentage,metadata) VALUES
  ('jurisdiction_policy_evaluation_enabled',TRUE,'Uses reviewed jurisdiction policy when active and the Lodario fallback everywhere else.',100,'{}'::JSONB),
  ('existing_player_policy_enforcement_enabled',FALSE,'Allows an explicit administrator rollout to restrict existing accounts after a material policy change.',0,'{"gracePeriodDays":30}'::JSONB)
ON CONFLICT (flag_key) DO UPDATE SET description=EXCLUDED.description,metadata=EXCLUDED.metadata;

ALTER TABLE public.guardian_jurisdiction_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_policy_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_policy_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_country_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.guardian_jurisdiction_policies, public.guardian_policy_decisions,
  public.player_policy_notifications, public.iso_country_codes FROM anon,authenticated;

CREATE POLICY "Players can view own policy decisions" ON public.guardian_policy_decisions
  FOR SELECT TO authenticated USING (player_user_id=auth.uid());
CREATE POLICY "Players can view own policy notifications" ON public.player_policy_notifications
  FOR SELECT TO authenticated USING (player_user_id=auth.uid());
GRANT SELECT ON public.guardian_policy_decisions,public.player_policy_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.evaluate_player_age_policy(
  p_date_of_birth DATE,
  p_country_code TEXT DEFAULT 'ZZ',
  p_as_of DATE DEFAULT current_date
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions
AS $$
DECLARE selected_policy public.guardian_jurisdiction_policies%ROWTYPE;
DECLARE fallback_policy public.guardian_jurisdiction_policies%ROWTYPE;
DECLARE normalized_country TEXT;
DECLARE player_age INTEGER;
DECLARE threshold INTEGER;
DECLARE approval_required BOOLEAN;
DECLARE connection_required BOOLEAN;
DECLARE fallback_used BOOLEAN:=FALSE;
DECLARE age_band TEXT;
DECLARE reason TEXT;
DECLARE next_transition DATE;
DECLARE jurisdiction_evaluation_enabled BOOLEAN;
BEGIN
  IF p_date_of_birth IS NULL OR p_date_of_birth>p_as_of OR p_date_of_birth<p_as_of-INTERVAL '100 years' THEN
    RAISE EXCEPTION 'A valid date of birth is required.' USING ERRCODE='22023';
  END IF;
  normalized_country:=upper(btrim(coalesce(p_country_code,'')));
  IF normalized_country<>'ZZ' AND NOT EXISTS(SELECT 1 FROM public.iso_country_codes c WHERE c.country_code=normalized_country) THEN
    RAISE EXCEPTION 'A valid ISO country code is required.' USING ERRCODE='22023';
  END IF;

  jurisdiction_evaluation_enabled:=public.guardian_flag_enabled('jurisdiction_policy_evaluation_enabled');
  IF jurisdiction_evaluation_enabled AND normalized_country<>'ZZ' THEN
    SELECT * INTO selected_policy FROM public.guardian_jurisdiction_policies p
    WHERE p.country_code=normalized_country
      AND p.subdivision_code IS NULL
      AND p.policy_status='reviewed'
      AND p.legal_review_status IN ('authoritative_source_reviewed','legal_counsel_approved')
      AND p.effective_from<=p_as_of
      AND (p.effective_until IS NULL OR p.effective_until>=p_as_of)
    ORDER BY p.effective_from DESC,p.created_at DESC LIMIT 1;
  END IF;

  IF selected_policy.id IS NULL THEN
    SELECT * INTO fallback_policy FROM public.guardian_jurisdiction_policies p
    WHERE p.country_code='ZZ' AND p.rule_type='lodario_fallback'
      AND p.policy_status='reviewed'
      AND p.legal_review_status IN ('authoritative_source_reviewed','legal_counsel_approved')
      AND p.effective_from<=p_as_of AND (p.effective_until IS NULL OR p.effective_until>=p_as_of)
    ORDER BY p.effective_from DESC,p.created_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Guardian policy is temporarily unavailable.' USING ERRCODE='55000'; END IF;
    selected_policy:=fallback_policy;
    fallback_used:=TRUE;
  END IF;

  player_age:=public.calculate_player_age(p_date_of_birth,p_as_of);
  threshold:=coalesce(selected_policy.guardian_required_below_age,selected_policy.secondary_guardian_age);

  IF selected_policy.rule_type='lodario_fallback' THEN
    approval_required:=player_age<selected_policy.guardian_required_below_age;
    connection_required:=player_age<selected_policy.secondary_guardian_age;
    reason:=CASE WHEN approval_required THEN 'lodario_fallback_under_13'
      WHEN connection_required THEN 'lodario_fallback_minor_connection'
      ELSE 'lodario_fallback_adult_no_guardian' END;
  ELSE
    approval_required:=threshold IS NOT NULL AND player_age<threshold;
    connection_required:=approval_required;
    reason:=CASE WHEN approval_required THEN
      CASE selected_policy.rule_type
        WHEN 'capacity_based' THEN 'reviewed_capacity_policy_below_operational_threshold'
        WHEN 'federal_with_local_overrides' THEN 'reviewed_federal_policy_below_threshold'
        ELSE 'reviewed_policy_below_threshold' END
      ELSE 'reviewed_policy_at_or_above_threshold' END;
  END IF;

  age_band:=CASE WHEN approval_required THEN 'under_self_consent'
    WHEN player_age<18 THEN 'minor' ELSE 'adult' END;
  next_transition:=CASE
    WHEN approval_required AND threshold IS NOT NULL THEN (p_date_of_birth+make_interval(years=>threshold))::DATE
    WHEN connection_required THEN (p_date_of_birth+INTERVAL '18 years')::DATE
    WHEN player_age<18 THEN (p_date_of_birth+INTERVAL '18 years')::DATE
    ELSE NULL END;

  RETURN jsonb_build_object(
    'countryCode',normalized_country,
    'jurisdictionPolicyId',selected_policy.id,
    'jurisdictionName',selected_policy.jurisdiction_name,
    'jurisdictionLevel',selected_policy.jurisdiction_level,
    'ruleType',selected_policy.rule_type,
    'age',player_age,
    'ageBand',age_band,
    'guardianRequired',connection_required,
    'guardianApprovalRequired',approval_required,
    'guardianConnectionRequired',connection_required,
    'guardianOverviewRequired',connection_required,
    'guardianThreshold',threshold,
    'secondaryGuardianAge',selected_policy.secondary_guardian_age,
    'capacityAssessmentRequired',selected_policy.capacity_assessment_required,
    'consentBasisScope',selected_policy.consent_basis_scope,
    'guardianRequirementMode',selected_policy.guardian_requirement_mode,
    'policyStatus',selected_policy.policy_status,
    'policyVersion',selected_policy.policy_version,
    'policySourceAuthority',selected_policy.source_authority,
    'fallbackUsed',fallback_used,
    'jurisdictionFallbackUsed',fallback_used,
    'decisionReason',reason,
    'evaluatedAt',now(),
    'nextAgeTransitionAt',next_transition,
    'nextTransitionAt',next_transition,
    'verificationLevel','email'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_guardian_policy_decision(
  p_player_id UUID,p_evaluation JSONB,p_previous_policy_id UUID,p_reason TEXT,
  p_application_mode TEXT,p_enforcement_status TEXT,p_grace_ends_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE decision_id UUID;
BEGIN
  INSERT INTO public.guardian_policy_decisions(
    player_user_id,policy_id,previous_policy_id,country_code,age_at_evaluation,decision,decision_hash,
    reason,application_mode,enforcement_status,grace_ends_at,evaluated_at
  ) VALUES(
    p_player_id,(p_evaluation->>'jurisdictionPolicyId')::UUID,p_previous_policy_id,p_evaluation->>'countryCode',
    (p_evaluation->>'age')::INTEGER,p_evaluation,
    extensions.digest(convert_to(p_evaluation::TEXT,'UTF8'),'sha256'),
    p_reason,p_application_mode,p_enforcement_status,p_grace_ends_at,
    coalesce((p_evaluation->>'evaluatedAt')::TIMESTAMPTZ,now())
  ) RETURNING id INTO decision_id;
  RETURN decision_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.player_set_initial_age(p_date_of_birth DATE,p_country_code TEXT DEFAULT 'ZZ')
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE active_user UUID:=auth.uid();
DECLARE evaluation JSONB;
DECLARE state TEXT;
DECLARE profile_role TEXT;
DECLARE decision_id UUID;
BEGIN
  IF active_user IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501'; END IF;
  SELECT role INTO profile_role FROM public.profiles WHERE id=active_user;
  IF NOT (public.has_account_role(active_user,'player') OR profile_role IS NULL OR profile_role='player') THEN
    RAISE EXCEPTION 'Player account required.' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.player_age_identities WHERE player_user_id=active_user) THEN
    RAISE EXCEPTION 'Age information is already recorded. Use the correction request process.' USING ERRCODE='23505';
  END IF;
  IF upper(btrim(coalesce(p_country_code,'')))='ZZ' THEN
    RAISE EXCEPTION 'Select a valid country of residence.' USING ERRCODE='22023';
  END IF;
  evaluation:=public.evaluate_player_age_policy(p_date_of_birth,p_country_code,current_date);
  state:=CASE WHEN (evaluation->>'guardianApprovalRequired')::BOOLEAN THEN 'guardian_required' ELSE 'active' END;

  INSERT INTO public.profiles(id,age,positions,priorities,role,onboarding_completed)
  VALUES(active_user,(evaluation->>'age')::INTEGER,'{}','{}','player',FALSE)
  ON CONFLICT(id) DO UPDATE SET age=EXCLUDED.age;
  INSERT INTO public.user_account_roles(user_id,role) VALUES(active_user,'player')
  ON CONFLICT(user_id,role) DO UPDATE SET status='active';
  INSERT INTO public.player_age_identities(
    player_user_id,date_of_birth,country_code,age_band,age_policy_version,next_transition_at,
    guardian_approval_required,guardian_overview_required,guardian_connection_required,
    account_state,jurisdiction_policy_id,fallback_used,policy_status,decision_reason,last_policy_decision
  ) VALUES(
    active_user,p_date_of_birth,evaluation->>'countryCode',evaluation->>'ageBand',evaluation->>'policyVersion',
    (evaluation->>'nextAgeTransitionAt')::TIMESTAMPTZ,
    (evaluation->>'guardianApprovalRequired')::BOOLEAN,(evaluation->>'guardianConnectionRequired')::BOOLEAN,
    (evaluation->>'guardianConnectionRequired')::BOOLEAN,state,
    (evaluation->>'jurisdictionPolicyId')::UUID,(evaluation->>'fallbackUsed')::BOOLEAN,
    evaluation->>'policyStatus',evaluation->>'decisionReason',evaluation
  );
  decision_id:=public.record_guardian_policy_decision(active_user,evaluation,NULL,evaluation->>'decisionReason','initial_onboarding',
    CASE WHEN state='guardian_required' THEN 'applied' ELSE 'not_required' END,NULL);
  PERFORM public.guardian_write_audit('jurisdiction_policy_evaluated',active_user,NULL,NULL,'success',
    jsonb_build_object('policyId',evaluation->>'jurisdictionPolicyId','fallbackUsed',evaluation->>'fallbackUsed','decisionReason',evaluation->>'decisionReason'));
  PERFORM public.guardian_track_product_event('age_step_completed',jsonb_build_object('ageBand',evaluation->>'ageBand','fallbackUsed',evaluation->>'fallbackUsed'));
  RETURN evaluation||jsonb_build_object('accountState',state,'restricted',state='guardian_required','policyDecisionId',decision_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.player_get_my_guardian_state()
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE active_user UUID:=auth.uid();
DECLARE identity public.player_age_identities%ROWTYPE;
DECLARE created_at_value TIMESTAMPTZ;
BEGIN
  IF active_user IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO identity FROM public.player_age_identities WHERE player_user_id=active_user;
  SELECT created_at INTO created_at_value FROM auth.users WHERE id=active_user;
  IF identity.player_user_id IS NULL THEN
    RETURN jsonb_build_object('ageKnown',FALSE,'ageCheckpointRequired',
      public.guardian_flag_enabled('date_of_birth_collection_enabled') AND
      (public.guardian_flag_enabled('existing_user_age_checkpoint_enabled') OR created_at_value>='2026-07-22 00:00:00+00'::TIMESTAMPTZ),
      'restricted',FALSE,'featureFlags',(SELECT coalesce(jsonb_object_agg(flag_key,enabled),'{}'::JSONB) FROM public.guardian_feature_flags));
  END IF;
  PERFORM public.process_my_age_transition();
  SELECT * INTO identity FROM public.player_age_identities WHERE player_user_id=active_user;
  RETURN jsonb_build_object(
    'ageKnown',TRUE,'ageBand',identity.age_band,'countryCode',identity.country_code,
    'jurisdictionPolicyId',identity.jurisdiction_policy_id,'policyVersion',identity.age_policy_version,
    'policyStatus',identity.policy_status,'fallbackUsed',identity.fallback_used,'decisionReason',identity.decision_reason,
    'accountState',identity.account_state,'guardianRequired',identity.guardian_connection_required,
    'guardianApprovalRequired',identity.guardian_approval_required,
    'guardianConnectionRequired',identity.guardian_connection_required,
    'guardianOverviewRequired',identity.guardian_overview_required,'nextTransitionAt',identity.next_transition_at,
    'restricted',public.player_is_guardian_restricted(active_user),
    'invitations',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',i.id,'guardianEmailMasked',regexp_replace(i.guardian_email,'(^.).*(@.*$)','\1***\2'),
      'guardianName',i.guardian_name,'relationshipType',i.relationship_type,
      'status',CASE WHEN i.expires_at<=now() AND i.status IN ('pending','sent','delivered','opened') THEN 'expired' ELSE i.status END,
      'invitationType',i.invitation_type,'expiresAt',i.expires_at,'lastSentAt',i.last_sent_at,'resendAttempts',i.resend_attempts
    ) ORDER BY i.created_at DESC) FROM public.guardian_invitations i WHERE i.player_user_id=active_user),'[]'::JSONB),
    'relationships',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',r.id,'guardianName',coalesce(gp.display_name,'Guardian'),'relationshipType',r.relationship_type,
      'status',r.status,'linkedAt',r.linked_at,'isPrimary',r.is_primary,'permissionTemplate',r.permission_template_key
    ) ORDER BY r.created_at DESC) FROM public.guardian_player_relationships r
      LEFT JOIN public.guardian_profiles gp ON gp.user_id=r.guardian_user_id WHERE r.player_user_id=active_user),'[]'::JSONB),
    'correctionRequest',(SELECT jsonb_build_object('id',c.id,'status',c.status,'createdAt',c.created_at,'categoryChange',c.category_change)
      FROM public.player_date_of_birth_corrections c WHERE c.player_user_id=active_user ORDER BY c.created_at DESC LIMIT 1),
    'policyNotifications',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'type',n.notification_type,'title',n.title,'message',n.message,'createdAt',n.created_at)
      ORDER BY n.created_at DESC) FROM public.player_policy_notifications n WHERE n.player_user_id=active_user AND NOT n.is_read),'[]'::JSONB),
    'featureFlags',(SELECT coalesce(jsonb_object_agg(flag_key,enabled),'{}'::JSONB) FROM public.guardian_feature_flags)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_my_age_transition()
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor UUID:=auth.uid();
DECLARE current_identity public.player_age_identities%ROWTYPE;
DECLARE evaluated JSONB;
DECLARE changed BOOLEAN;
DECLARE newly_required BOOLEAN;
DECLARE newly_approval_required BOOLEAN;
DECLARE decision_id UUID;
DECLARE changed_count INTEGER:=0;
DECLARE grace_days INTEGER:=30;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO current_identity FROM public.player_age_identities WHERE player_user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('processed',FALSE,'reason','age_unknown'); END IF;
  evaluated:=public.evaluate_player_age_policy(current_identity.date_of_birth,current_identity.country_code,current_date);
  changed:=current_identity.jurisdiction_policy_id IS DISTINCT FROM (evaluated->>'jurisdictionPolicyId')::UUID
    OR current_identity.age_band IS DISTINCT FROM evaluated->>'ageBand'
    OR current_identity.guardian_approval_required IS DISTINCT FROM (evaluated->>'guardianApprovalRequired')::BOOLEAN
    OR current_identity.guardian_connection_required IS DISTINCT FROM (evaluated->>'guardianConnectionRequired')::BOOLEAN;
  IF NOT changed THEN RETURN jsonb_build_object('processed',FALSE,'ageBand',evaluated->>'ageBand'); END IF;
  newly_required:=NOT current_identity.guardian_connection_required
    AND (evaluated->>'guardianConnectionRequired')::BOOLEAN;
  newly_approval_required:=NOT current_identity.guardian_approval_required
    AND (evaluated->>'guardianApprovalRequired')::BOOLEAN;
  SELECT coalesce((metadata->>'gracePeriodDays')::INTEGER,30) INTO grace_days
  FROM public.guardian_feature_flags WHERE flag_key='existing_player_policy_enforcement_enabled';

  UPDATE public.player_age_identities SET
    age_band=evaluated->>'ageBand',age_policy_version=evaluated->>'policyVersion',
    policy_evaluated_at=now(),next_transition_at=(evaluated->>'nextAgeTransitionAt')::TIMESTAMPTZ,
    guardian_approval_required=(evaluated->>'guardianApprovalRequired')::BOOLEAN,
    guardian_overview_required=(evaluated->>'guardianConnectionRequired')::BOOLEAN,
    guardian_connection_required=(evaluated->>'guardianConnectionRequired')::BOOLEAN,
    jurisdiction_policy_id=(evaluated->>'jurisdictionPolicyId')::UUID,
    fallback_used=(evaluated->>'fallbackUsed')::BOOLEAN,policy_status=evaluated->>'policyStatus',
    decision_reason=evaluated->>'decisionReason',last_policy_decision=evaluated,
    account_state=CASE
      WHEN NOT (evaluated->>'guardianApprovalRequired')::BOOLEAN
        AND account_state IN ('guardian_required','invitation_pending','approval_pending','rejected','review_required','relationship_revoked')
        THEN 'active'
      WHEN newly_approval_required AND account_state='active' THEN 'active'
      ELSE account_state END
  WHERE player_user_id=actor;

  decision_id:=public.record_guardian_policy_decision(actor,evaluated,current_identity.jurisdiction_policy_id,
    CASE WHEN newly_required THEN 'material_policy_change_new_guardian_requirement' ELSE evaluated->>'decisionReason' END,
    CASE WHEN current_identity.age_band IS DISTINCT FROM evaluated->>'ageBand' THEN 'birthday_transition' ELSE 'policy_reconciliation' END,
    CASE WHEN newly_required THEN 'pending_admin_rollout' ELSE 'applied' END,
    CASE WHEN newly_approval_required THEN now()+make_interval(days=>grace_days) ELSE NULL END);

  IF newly_required THEN
    INSERT INTO public.player_policy_notifications(player_user_id,notification_type,title,message,policy_decision_id)
    VALUES(actor,'guardian_now_required','Guardian policy update',
      'Based on the information provided, a parent or Guardian needs to be connected to this account. Your existing access has not been locked. Further notice will be provided before any enforcement change.',
      decision_id);
  ELSIF current_identity.guardian_connection_required AND NOT (evaluated->>'guardianConnectionRequired')::BOOLEAN THEN
    INSERT INTO public.player_policy_notifications(player_user_id,notification_type,title,message,policy_decision_id)
    VALUES(actor,'guardian_no_longer_required','Guardian requirement updated',
      'A Guardian connection is no longer required for your account. Existing voluntary relationships remain removable from your settings.',decision_id);
  END IF;

  IF evaluated->>'ageBand'='adult' AND current_identity.age_band<>'adult' AND public.guardian_flag_enabled('age_18_transition_enabled') THEN
    UPDATE public.guardian_player_relationships SET status='suspended',suspended_at=now(),last_policy_review_at=now()
    WHERE player_user_id=actor AND status='active';
    GET DIAGNOSTICS changed_count=ROW_COUNT;
    UPDATE public.player_age_identities SET account_state=CASE WHEN changed_count>0 THEN 'adult_review_pending' ELSE 'active' END WHERE player_user_id=actor;
  END IF;
  RETURN jsonb_build_object('processed',TRUE,'ageBand',evaluated->>'ageBand','newlyRequired',newly_required,'policyDecisionId',decision_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_guardian_policy_changes(
  p_country_code TEXT,
  p_apply_enforcement BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(player_id UUID,decision_id UUID,enforcement_status TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE identity public.player_age_identities%ROWTYPE;
DECLARE evaluated JSONB;
DECLARE decision_uuid UUID;
DECLARE newly_required BOOLEAN;
DECLARE newly_approval_required BOOLEAN;
DECLARE enforcement TEXT;
DECLARE grace_days INTEGER:=30;
BEGIN
  -- No normal-user grant is provided. Invoke only from a trusted service/admin session.
  SELECT coalesce((metadata->>'gracePeriodDays')::INTEGER,30) INTO grace_days
  FROM public.guardian_feature_flags WHERE flag_key='existing_player_policy_enforcement_enabled';
  FOR identity IN SELECT * FROM public.player_age_identities WHERE country_code=upper(p_country_code) FOR UPDATE LOOP
    evaluated:=public.evaluate_player_age_policy(identity.date_of_birth,identity.country_code,current_date);
    newly_required:=NOT identity.guardian_connection_required
      AND (evaluated->>'guardianConnectionRequired')::BOOLEAN;
    newly_approval_required:=NOT identity.guardian_approval_required
      AND (evaluated->>'guardianApprovalRequired')::BOOLEAN;
    enforcement:=CASE
      WHEN newly_approval_required AND p_apply_enforcement AND public.guardian_flag_enabled('existing_player_policy_enforcement_enabled') THEN 'grace_period'
      WHEN newly_required THEN 'pending_admin_rollout'
      ELSE 'applied' END;
    UPDATE public.player_age_identities SET
      age_band=evaluated->>'ageBand',age_policy_version=evaluated->>'policyVersion',
      policy_evaluated_at=now(),next_transition_at=(evaluated->>'nextAgeTransitionAt')::TIMESTAMPTZ,
      guardian_approval_required=(evaluated->>'guardianApprovalRequired')::BOOLEAN,
      guardian_overview_required=(evaluated->>'guardianConnectionRequired')::BOOLEAN,
      guardian_connection_required=(evaluated->>'guardianConnectionRequired')::BOOLEAN,
      jurisdiction_policy_id=(evaluated->>'jurisdictionPolicyId')::UUID,
      fallback_used=(evaluated->>'fallbackUsed')::BOOLEAN,policy_status=evaluated->>'policyStatus',
      decision_reason=evaluated->>'decisionReason',last_policy_decision=evaluated
    WHERE player_user_id=identity.player_user_id;
    decision_uuid:=public.record_guardian_policy_decision(identity.player_user_id,evaluated,identity.jurisdiction_policy_id,
      CASE WHEN newly_required THEN 'material_policy_change_new_guardian_requirement' ELSE evaluated->>'decisionReason' END,
      CASE WHEN p_apply_enforcement THEN 'admin_rollout' ELSE 'policy_reconciliation' END,enforcement,
      CASE WHEN newly_approval_required THEN now()+make_interval(days=>grace_days) ELSE NULL END);
    IF newly_required THEN
      INSERT INTO public.player_policy_notifications(player_user_id,notification_type,title,message,policy_decision_id)
      VALUES(identity.player_user_id,'guardian_now_required','Guardian policy update',
        'Based on the information provided, a parent or Guardian needs to be connected to this account. Your current access remains available during the review and grace process.',
        decision_uuid);
    END IF;
    player_id:=identity.player_user_id;decision_id:=decision_uuid;enforcement_status:=enforcement;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_player_dob_correction(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_resolution_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE correction public.player_date_of_birth_corrections%ROWTYPE;
DECLARE identity public.player_age_identities%ROWTYPE;
DECLARE evaluated JSONB;
DECLARE newly_approval_required BOOLEAN;
DECLARE newly_connection_required BOOLEAN;
DECLARE decision_uuid UUID;
DECLARE next_state TEXT;
BEGIN
  -- This function deliberately has no anon/authenticated grant. Use a trusted
  -- service/admin database session after completing the correction review.
  SELECT * INTO correction
  FROM public.player_date_of_birth_corrections
  WHERE id=p_request_id
  FOR UPDATE;
  IF NOT FOUND OR correction.status NOT IN ('submitted','guardian_confirmation_required','under_review') THEN
    RAISE EXCEPTION 'Open date-of-birth correction not found.' USING ERRCODE='22023';
  END IF;
  IF char_length(btrim(coalesce(p_resolution_note,'')))<3 THEN
    RAISE EXCEPTION 'A resolution note is required.' USING ERRCODE='22023';
  END IF;

  IF NOT p_approve THEN
    UPDATE public.player_date_of_birth_corrections
    SET status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),resolution_note=btrim(p_resolution_note)
    WHERE id=correction.id;
    PERFORM public.guardian_write_audit('dob_correction_rejected',correction.player_user_id,NULL,NULL,'success',
      jsonb_build_object('correctionId',correction.id));
    RETURN jsonb_build_object('approved',FALSE,'correctionId',correction.id);
  END IF;

  SELECT * INTO identity
  FROM public.player_age_identities
  WHERE player_user_id=correction.player_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player age identity not found.' USING ERRCODE='22023'; END IF;

  evaluated:=public.evaluate_player_age_policy(correction.requested_date_of_birth,identity.country_code,current_date);
  newly_approval_required:=NOT identity.guardian_approval_required
    AND (evaluated->>'guardianApprovalRequired')::BOOLEAN;
  newly_connection_required:=NOT identity.guardian_connection_required
    AND (evaluated->>'guardianConnectionRequired')::BOOLEAN;
  next_state:=CASE
    WHEN (evaluated->>'guardianApprovalRequired')::BOOLEAN THEN 'guardian_required'
    WHEN identity.account_state IN ('guardian_required','invitation_pending','approval_pending','rejected','review_required','relationship_revoked')
      THEN 'active'
    ELSE identity.account_state
  END;

  UPDATE public.player_age_identities SET
    date_of_birth=correction.requested_date_of_birth,
    age_band=evaluated->>'ageBand',
    age_policy_version=evaluated->>'policyVersion',
    policy_evaluated_at=now(),
    next_transition_at=(evaluated->>'nextAgeTransitionAt')::TIMESTAMPTZ,
    guardian_approval_required=(evaluated->>'guardianApprovalRequired')::BOOLEAN,
    guardian_overview_required=(evaluated->>'guardianConnectionRequired')::BOOLEAN,
    guardian_connection_required=(evaluated->>'guardianConnectionRequired')::BOOLEAN,
    account_state=next_state,
    jurisdiction_policy_id=(evaluated->>'jurisdictionPolicyId')::UUID,
    fallback_used=(evaluated->>'fallbackUsed')::BOOLEAN,
    policy_status=evaluated->>'policyStatus',
    decision_reason=evaluated->>'decisionReason',
    last_policy_decision=evaluated
  WHERE player_user_id=identity.player_user_id;
  UPDATE public.profiles SET age=(evaluated->>'age')::INTEGER WHERE id=identity.player_user_id;
  UPDATE public.player_date_of_birth_corrections
  SET status='approved',reviewed_by=auth.uid(),reviewed_at=now(),resolution_note=btrim(p_resolution_note)
  WHERE id=correction.id;

  decision_uuid:=public.record_guardian_policy_decision(
    identity.player_user_id,evaluated,identity.jurisdiction_policy_id,
    'approved_date_of_birth_correction','dob_correction',
    CASE WHEN (evaluated->>'guardianApprovalRequired')::BOOLEAN THEN 'applied' ELSE 'not_required' END,NULL
  );
  IF newly_connection_required THEN
    INSERT INTO public.player_policy_notifications(player_user_id,notification_type,title,message,policy_decision_id)
    VALUES(identity.player_user_id,'guardian_now_required','Guardian required after account review',
      CASE WHEN newly_approval_required
        THEN 'Your approved date-of-birth correction requires a parent or Guardian to approve this account before full access can continue.'
        ELSE 'Your approved date-of-birth correction requires a parent or Guardian connection. You can continue using Lodario while the invitation is pending.'
      END,decision_uuid);
  END IF;
  PERFORM public.guardian_write_audit('dob_correction_approved',identity.player_user_id,NULL,NULL,'success',
    jsonb_build_object('correctionId',correction.id,'policyDecisionId',decision_uuid,'newlyGuardianRequired',newly_connection_required));
  RETURN evaluated||jsonb_build_object(
    'approved',TRUE,'correctionId',correction.id,'policyDecisionId',decision_uuid,
    'accountState',next_state,'restricted',next_state='guardian_required'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_player_age_policy(DATE,TEXT,DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_guardian_policy_decision(UUID,JSONB,UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_guardian_policy_changes(TEXT,BOOLEAN) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.review_player_dob_correction(UUID,BOOLEAN,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_player_age_policy(DATE,TEXT,DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_set_initial_age(DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_get_my_guardian_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_my_age_transition() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_guardian_policy_changes(TEXT,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_player_dob_correction(UUID,BOOLEAN,TEXT) TO service_role;

COMMENT ON TABLE public.guardian_jurisdiction_policies IS
  'Server-only Guardian decision policies. Only active reviewed policies replace the Lodario fallback. Digital-consent configuration does not establish the lawful basis for health or special-category data.';
COMMENT ON TABLE public.guardian_policy_decisions IS
  'Append-only evidence of the policy selected and decision returned for a Player. Material changes for existing Players require explicit rollout.';
COMMENT ON FUNCTION public.reconcile_guardian_policy_changes(TEXT,BOOLEAN) IS
  'Service/admin-only reconciliation. New requirements are recorded and notified without immediate lock; enforcement also requires a disabled-by-default feature flag.';
COMMENT ON FUNCTION public.review_player_dob_correction(UUID,BOOLEAN,TEXT) IS
  'Service/admin-only correction review. Approval re-runs the central jurisdiction policy evaluator and records the decision.';
