# Devnet launch registry review

Adds one new server-only table, `gp_sol_devnet_launches`, and its creator index.
Only independently finalized Devnet mint/pool transactions are inserted. Unique mint, pool and signature prevent duplicate records. The cluster constraint rejects Mainnet. RLS is enabled and browser roles have no privileges; only the application service role can select/insert. No legacy accounts, balances or existing privileges change.

Production application requires explicit user approval. Staging verification is separate.

Rollback before any production records exist: `DROP TABLE public.gp_sol_devnet_launches;`. After records exist, disable new registry writes and export those records before separately approving a destructive rollback. Dropping a registry never reverses an on-chain transaction.
