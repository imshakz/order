#!/bin/sh
set -e

# Bring the database schema up to date, then make sure the basics (tier rules, an admin) exist.
# With several API replicas this is safe: schema push and seeding are idempotent.
npx prisma db push --skip-generate
node dist/seed.js

exec node dist/main.js
