-- Where each user is in the conversation (setup step, what Sika is waiting for, the plan being built).
ALTER TABLE users ADD COLUMN flow_json TEXT;
