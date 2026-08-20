-- This disposable account needs global privileges because `prisma migrate dev`
-- creates and drops a temporary shadow database. Never use this grant in production.
GRANT ALL PRIVILEGES ON *.* TO 'ordering'@'%';
