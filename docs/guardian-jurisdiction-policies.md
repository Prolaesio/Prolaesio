# Guardian jurisdiction policies

Checked: 2026-07-23

This document is an engineering and policy-operation record, not legal advice. The database is authoritative for runtime decisions. The central evaluator is `public.evaluate_player_age_policy(date_of_birth, country_code, as_of)`.

## Decision paths

Only a policy with all of the following replaces the fallback:

- `policy_status = reviewed`
- `legal_review_status` is `authoritative_source_reviewed` or `legal_counsel_approved`
- the effective date has begun
- the policy has not expired
- jurisdiction evaluation is enabled

For an active reviewed policy, a Player younger than its operational threshold must complete Guardian onboarding. A Player exactly at or above the threshold skips mandatory Guardian onboarding completely: no Guardian email, invitation, pending relationship, reminder, or restriction is created.

For all other ISO countries and territories, including pending, disabled, superseded, future, and expired records, Lodario applies its product-safety fallback:

- Under 13: Guardian connection and approval required; restricted until approval.
- Ages 13–17: Guardian connection and invitation required; the Player remains usable while pending, rejected, expired, or unaccepted.
- Age 18+: mandatory Guardian onboarding is skipped.

Fallback messages describe a Lodario requirement based on the information provided. They must not say local law requires the connection.

## Active reviewed policies

The values below are runtime operational decisions. “Threshold 13” means required below 13 and skipped from the 13th birthday onward.

| Country | Code | Rule type | Runtime policy | Official authority and source | Limitation |
|---|---:|---|---|---|---|
| Portugal | PT | `fixed_age` | Threshold 13 | [Diário da República, Law 58/2019 Article 16](https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982); [CNPD](https://www.cnpd.pt/cidadaos/direitos/) | Consent-based direct offer of information-society services. |
| France | FR | `fixed_age` | Threshold 15 | [CNIL, Loi Informatique et Libertés Article 45](https://www.cnil.fr/fr/le-cadre-national/la-loi-informatique-et-libertes) | Consent-based online-service processing; below 15 involves child and parental consent. |
| Ireland | IE | `fixed_age` | Threshold 16 | [Data Protection Commission](https://www.dataprotection.ie/en/dpc-guidance/children-parents-and-data-protection-can-i-make-complaint-behalf-my-child) | Applies where online processing relies on consent. |
| United Kingdom | GB | `fixed_age` | Threshold 13 | [Information Commissioner’s Office](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr-old/what-are-the-rules-about-an-iss-and-consent/) | Not inherited by Crown Dependencies or Overseas Territories. |
| United States | US | `federal_with_local_overrides` | Federal under-13 rule | [Federal Trade Commission, COPPA Rule](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa) | Applies to COPPA-covered child-directed services and services with actual knowledge. State override rows are supported; none is active. |
| Canada | CA | `capacity_based` | OPC-supported operational threshold 13 | [Office of the Privacy Commissioner of Canada](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_consent/) | Age 13 is not represented as a universal statute. OPC says under-13 meaningful consent is exceptional; maturity still matters. Provincial overrides are supported. |
| Australia | AU | `capacity_based` | Operational threshold 16 | [Office of the Australian Information Commissioner](https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/children-and-young-people) | No fixed Privacy Act age. Capacity is case-by-case; OAIC says capacity may generally be assumed over age 15 if individual assessment is impractical. State/territory rules may also apply. |
| Austria | AT | `fixed_age` | Threshold 14 | [Austrian Data Protection Authority](https://dsb.gv.at/ueber-die-datenschutzbehoerde/teens-kids) | GDPR Article 8 and Austrian DSG section 4(4). |
| Belgium | BE | `fixed_age` | Threshold 13 | [Belgian Data Protection Authority](https://www.dataprotectionauthority.be/professionnel/rgpd-/bases-juridiques/consentement) | Consent-based information-society services. |
| Bulgaria | BG | `fixed_age` | Threshold 14 | [Bulgarian Commission for Personal Data Protection](https://cpdp.bg/home-default/%D0%BF%D0%BE%D0%BB%D0%B5%D0%B7%D0%BD%D0%B0-%D0%B8%D0%BD%D1%84%D0%BE%D1%80%D0%BC%D0%B0%D1%86%D0%B8%D1%8F/%D0%BF%D1%80%D0%B0%D0%B2%D0%B0%D1%82%D0%B0-%D0%BD%D0%B0-%D0%B4%D0%B5%D1%86%D0%B0%D1%82%D0%B0-%D0%B8-%D0%BC%D0%BB%D0%B0%D0%B4%D0%B8%D1%82%D0%B5-%D1%85%D0%BE%D1%80%D0%B0-%D0%BF%D1%80%D0%B8-%D1%80%D0%B0/) | Personal Data Protection Act Article 25c. |
| Croatia | HR | `fixed_age` | Threshold 16 | [Croatian Personal Data Protection Agency](https://azop.hr/national-legislation/) | Implementing Act Article 19; permanent-residence qualifier recorded. |
| Cyprus | CY | `fixed_age` | Threshold 14 | [Republic of Cyprus, Law 125(I)/2018](https://www.gov.cy/media/sites/175/2026/01/Law-125I-of-2018-ENG-final.pdf) | Section 8. |
| Czechia | CZ | `fixed_age` | Threshold 15 | [Czech Office for Personal Data Protection, Act 110/2019](https://uoou.gov.cz/media/act-no-110-2019-coll.pdf) | Section 7. |
| Denmark | DK | `fixed_age` | Threshold 13 | [Danish Data Protection Agency](https://www.datatilsynet.dk/regler-og-vejledning/myter-om-gdpr) | Danish Data Protection Act section 6(2). |
| Estonia | EE | `fixed_age` | Threshold 13 | [Riigi Teataja, Personal Data Protection Act](https://www.riigiteataja.ee/en/eli/507112023002/consolide) | Section 8. |
| Finland | FI | `fixed_age` | Threshold 13 | [Finlex, Data Protection Act 1050/2018](https://finlex.fi/en/legislation/translations/2018/eng/1050) | Section 5. |
| Germany | DE | `fixed_age` | Threshold 16 | [Federal Commissioner for Data Protection](https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Broschueren/INFO1.pdf) | Germany has not lowered the GDPR Article 8 threshold. |
| Greece | GR | `fixed_age` | Threshold 15 | [Hellenic Data Protection Authority](https://www.dpa.gr/el/polites/prostasia) | Law 4624/2019 Article 21. |
| Hungary | HU | `fixed_age` | Threshold 16 | [Hungarian data-protection authority guidance](https://naih.hu/files/handbook_the_gdpr_made_simpler_for%20smes_eng.pdf) | Hungary has not lowered the Article 8 threshold. |
| Italy | IT | `fixed_age` | Threshold 14 | [Italian Data Protection Authority](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9536089) | Privacy Code Article 2-quinquies. |
| Latvia | LV | `fixed_age` | Threshold 13 | [Latvian Data State Inspectorate](https://www.dvi.gov.lv/lv/media/1517/download) | Official information-society-service consent guidance. |
| Lithuania | LT | `fixed_age` | Threshold 14 | [Seimas consolidated law](https://e-seimas.lrs.lt/rs/legalact/TAD/3e1ba58238c711edbf47f0036855e731/) | Law on Legal Protection of Personal Data Article 6. |
| Luxembourg | LU | `fixed_age` | Threshold 16 | [Luxembourg CNPD](https://cnpd.public.lu/en/professionnels/obligations/liceite/consentement.html) | Current child-consent guidance. |
| Malta | MT | `fixed_age` | Threshold 13 | [Malta IDPC legislation register](https://idpc.org.mt/our-office/legislation/) | Subsidiary Legislation 586.11. |
| Netherlands | NL | `fixed_age` | Threshold 16 | [Official GDPR Implementation Act](https://wetten.overheid.nl/BWBR0040940/2021-07-01) | Article 5; no informal 13-year legal threshold. |
| Poland | PL | `fixed_age` | Threshold 16 | [Polish Personal Data Protection Office](https://uodo.gov.pl/en/680/1395) | Official guidance for information-society services. |
| Romania | RO | `fixed_age` | Threshold 16 | [Romanian supervisory authority FAQ](https://www.dataprotection.ro/index.jsp?lang=en&page=IntrebariFrecvente1) | FAQ question 17. |
| Slovakia | SK | `fixed_age` | Threshold 16 | [Slovak data-protection authority FAQ](https://dataprotection.gov.sk/en/legislation/guidelines-faq/frequently-asked-questions-faq/) | Parental authorisation below 16 for applicable services. |
| Slovenia | SI | `fixed_age` | Threshold 15 | [Slovenian Information Commissioner](https://www.ip-rs.si/?id=102) | ZVOP-2 Article 8. |
| Spain | ES | `fixed_age` | Threshold 14 | [Spanish Data Protection Agency](https://www.aepd.es/preguntas-frecuentes/10-menores-y-educacion/FAQ-1001-cual-es-la-edad-para-que-los-menores-puedan-prestar-consentimiento-para-tratar-sus-datos-personales) | Organic Law 3/2018 Article 7. |
| Sweden | SE | `fixed_age` | Threshold 13 | [Swedish Authority for Privacy Protection](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/samtycke/) | Current consent guidance. |
| Norway | NO | `fixed_age` | Threshold 13 | [Norwegian Data Protection Authority](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/om-behandlingsgrunnlag/samtykke/) | Personal Data Act section 5; child-directed, consent-based services. |
| Iceland | IS | `fixed_age` | Threshold 13 | [Icelandic Act 90/2018](https://www.personuvernd.is/media/uncategorized/Act_No_90_2018_on_Data_Protection_and_the_Processing_of_Personal_Data.pdf) | Article 10. |
| Liechtenstein | LI | `fixed_age` | Threshold 16 | [Liechtenstein Data Protection Authority](https://www.datenschutzstelle.li/datenschutz/fuer-buergerinnen-und-buerger) | Directly offered information-society services. |

All 34 active priority records were source-checked and marked reviewed on 2026-07-23, with a review due date of 2027-01-23. The migration stores 2026-07-23 as Lodario’s operational activation date, not as a claim that the underlying national law began on that date. Production counsel can approve or replace them sooner.

The shared EU context is GDPR Article 8: the default consent age for an information-society service is 16, and member-state law may lower it no further than 13. This is context, not a basis for assigning the same value to every member state. See the [European Data Protection Board](https://www.edpb.europa.eu/sme-data-protection-guide/be-compliant/process-personal-data-lawfully_en) and [European Commission](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en).

## Policies requiring verification

Only New Zealand and Switzerland remain `pending_review`, contain no asserted threshold, and use the fallback.

- New Zealand’s [Office of the Privacy Commissioner](https://www.privacy.org.nz/resources-and-learning/a-z-topics/protecting-children-and-young-peoples-privacy/childrens-privacy-guidance-for-the-education-sector/chapter-1-children-young-people-and-their-personal-information/) states that the Privacy Act applies regardless of age and that age and cognitive maturity affect a young person’s ability to exercise privacy rights. It does not provide a fixed online-consent threshold.
- Swiss federal guidance treats capacity for judgment as issue- and situation-specific, including for minors. See the [Federal Office of Public Health explanation](https://www.bag.admin.ch/bag/en/home/medizin-und-forschung/patientenrechte/rechte-arzt-spital/2-freie-einwilligung-nach-aufklaerung.html). No sufficiently clear fixed data-protection implementation threshold was verified.

The system does not invent a fixed age where capacity, judgment, or civil-law competence is the relevant standard. Activating either jurisdiction would require a defensible individual capacity-assessment design or a separately approved Lodario operational rule.

## Legal and privacy scope

A configured online-consent age does not establish that all Lodario processing is lawful:

- The Article 6 or equivalent lawful basis must be assessed for each purpose.
- Wellness, pain, injury, and similar information may be health or special-category data and needs a separate Article 9 or local-law analysis.
- Age-appropriate transparency, purpose limitation, data minimisation, retention, security, and children’s best interests still apply.
- App-store availability or an app-store age rating does not establish jurisdictional compliance.
- Product launch policies require qualified legal review, including local health, consumer, child-safety, and provincial/state rules.

Do not place this internal legal explanation in Player onboarding.

## Adding or changing a policy

Never edit a migration that has already been applied.

1. Verify the current rule against legislation or an official regulator. Record the authority, direct source URL, check date, scope, uncertainty, effective dates, and internal explanation.
2. Add a later additive migration. Insert a new immutable `policy_version`; do not overwrite decision history.
3. Leave the row `pending_review` with no asserted threshold until the review is complete.
4. To activate it, mark the new version `reviewed`, set an accepted `legal_review_status`, and provide valid effective dates. Mark the prior version `superseded` or give it an `effective_until`.
5. Run boundary tests for one day below, exactly at, and one day above the threshold. Test fallback selection for inactive versions.
6. Dry-run reconciliation for the country. Review counts and decisions before any rollout.

To disable an outdated policy, create a later migration that sets it to `disabled` (or ends its effective period) and adds a corrected version if available. The evaluator will use a valid replacement or fallback; it never selects an inactive record.

## Existing Players and reconciliation

The system re-evaluates when a Player completes the age checkpoint, loads after a birthday/policy change, reaches 18, receives an approved DOB correction, or is included in an administrator reconciliation.

`public.reconcile_guardian_policy_changes(country_code, apply_enforcement)` is service/admin-only. It writes an append-only decision, notifies Players about new requirements, and does not immediately lock an active account. Enforcement requires both:

- the disabled-by-default `existing_player_policy_enforcement_enabled` flag, and
- an explicit call with `apply_enforcement = true`.

The default grace period is 30 days in feature-flag metadata. Review reconciliation output before changing that flag. `public.review_player_dob_correction` is also service/admin-only and re-runs the same evaluator after an approved correction.

Players not subject to a mandatory Guardian requirement may voluntarily invite a Guardian later. That relationship remains accepted, removable, read-only, and non-restrictive while pending or rejected.
