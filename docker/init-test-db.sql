-- Runs only on first initialisation of the compose volume.
-- The application database is created by POSTGRES_DB; this second database is
-- what `npm test` uses from the host so tests never touch the demo data.
CREATE DATABASE ticket_queue_test OWNER ticket;
