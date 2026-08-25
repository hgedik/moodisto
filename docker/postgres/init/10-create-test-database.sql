-- The integration suite runs against a dedicated database so that a `db:reset` during
-- development never wipes test fixtures and vice versa.
CREATE DATABASE moodisto_test OWNER moodisto;

-- The end-to-end suite resets its database on every run, so it gets one of its own as well.
CREATE DATABASE moodisto_e2e OWNER moodisto;
