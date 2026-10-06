## TODOs for the user

- preview the plan, especially phase 3 - was reported as the biggest.
    -ppreviewed brief
    -previewed phase 1
- be attentive in this review - CTX reached 18%. Unusually high.
- implement the plan


- Run implement on phase 5 so the two last HEIC test can be checked off when you perform it.

- impl phase 1, 2 findings:
  - hardcoded literals:
    - src/lib/schemas/note-images.test.ts
    - src/lib/services/note-images has the same issue - hardocded, same literals.
    - tests/integration/note-images.test.ts
    - src/pages/api/campaigns/[campaignId]/notes/[noteId]/images/[imagesId].ts
    - src/pages/api/campaigns/[campaignId]/notes/[noteId]/images/uploads.ts
    - tests/integration/note-images.test.ts