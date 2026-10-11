## TODOs for the user

- run plan review
- Things the implementer needs to watch for:
  - When the database's row-level security (RLS) blocks an update or delete, it returns no error and simply affects zero rows. Tests must prove the block by re-reading the row as its owner, not by expecting an error.
  - The image upload and commit routes validate the request body before they check ownership. Their test rows need a valid body and lowercase IDs, or they get a 400 and prove nothing about isolation.