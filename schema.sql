
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),paused INTEGER NOT NULL DEFAULT 1,heartbeat TEXT);
INSERT OR IGNORE INTO settings(id) VALUES(1);
CREATE TABLE IF NOT EXISTS articles(
 id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,price INTEGER NOT NULL CHECK(price IN(0,200)),
 paywall INTEGER NOT NULL DEFAULT 0 CHECK(paywall>=0),tags TEXT NOT NULL DEFAULT '[]',images TEXT NOT NULL DEFAULT '[]',sources TEXT NOT NULL DEFAULT '[]',cover TEXT NOT NULL DEFAULT 'null',
 revision INTEGER NOT NULL DEFAULT 1,hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','revision_requested','rejected','approved','scheduled','preparing','prepared','failed','uncertain','published')),
 approved_hash TEXT,approved_revision INTEGER,scheduled_at TEXT,lease TEXT,lease_until TEXT,
 public_url TEXT,error TEXT,actor TEXT NOT NULL,updated_at TEXT NOT NULL,
 CHECK(approved_hash IS NULL OR (approved_hash=hash AND approved_revision=revision)),
 CHECK(status NOT IN('approved','scheduled','preparing','prepared','published') OR approved_hash=hash)
);
CREATE TABLE IF NOT EXISTS revisions(article_id TEXT NOT NULL,revision INTEGER NOT NULL,title TEXT,body TEXT,price INTEGER,paywall INTEGER,tags TEXT,hash TEXT,created_at TEXT,images TEXT NOT NULL DEFAULT '[]',sources TEXT NOT NULL DEFAULT '[]',cover TEXT NOT NULL DEFAULT 'null',PRIMARY KEY(article_id,revision));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,article_id TEXT,action TEXT NOT NULL,actor TEXT NOT NULL,revision INTEGER,hash TEXT,detail TEXT,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY AUTOINCREMENT,article_id TEXT NOT NULL REFERENCES articles(id),revision INTEGER NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS subscriptions(endpoint TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,article_id TEXT,kind TEXT NOT NULL,delivered INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX IF NOT EXISTS due_articles ON articles(status,scheduled_at);
CREATE TRIGGER IF NOT EXISTS article_create AFTER INSERT ON articles BEGIN
 INSERT INTO revisions VALUES(NEW.id,NEW.revision,NEW.title,NEW.body,NEW.price,NEW.paywall,NEW.tags,NEW.hash,NEW.updated_at,NEW.images,NEW.sources,NEW.cover);
 INSERT INTO audit(article_id,action,actor,revision,hash) VALUES(NEW.id,'created',NEW.actor,NEW.revision,NEW.hash);
 INSERT INTO notifications(article_id,kind) VALUES(NEW.id,'created');
END;
CREATE TRIGGER IF NOT EXISTS article_change AFTER UPDATE ON articles BEGIN
 INSERT INTO audit(article_id,action,actor,revision,hash,detail) VALUES(NEW.id,CASE WHEN OLD.revision<>NEW.revision THEN 'revised' ELSE NEW.status END,NEW.actor,NEW.revision,NEW.hash,NEW.error);
 INSERT INTO notifications(article_id,kind) VALUES(NEW.id,CASE WHEN OLD.revision<>NEW.revision THEN 'revised' ELSE NEW.status END);
END;
CREATE TRIGGER IF NOT EXISTS article_revision AFTER UPDATE OF revision ON articles WHEN OLD.revision<>NEW.revision BEGIN
 INSERT INTO revisions VALUES(NEW.id,NEW.revision,NEW.title,NEW.body,NEW.price,NEW.paywall,NEW.tags,NEW.hash,NEW.updated_at,NEW.images,NEW.sources,NEW.cover);
END;
CREATE TRIGGER IF NOT EXISTS settings_change AFTER UPDATE OF paused ON settings BEGIN
 INSERT INTO audit(action,actor,detail) VALUES('pause_changed','owner',CAST(NEW.paused AS TEXT));
END;
CREATE TRIGGER IF NOT EXISTS no_audit_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit immutable'); END;
CREATE TRIGGER IF NOT EXISTS no_audit_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit immutable'); END;
CREATE TRIGGER IF NOT EXISTS no_revision_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'revision immutable'); END;
CREATE TRIGGER IF NOT EXISTS no_revision_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'revision immutable'); END;
CREATE TRIGGER IF NOT EXISTS require_approval_insert BEFORE INSERT ON articles
WHEN NEW.status IN('approved','scheduled','preparing','prepared','published') AND (NEW.approved_hash IS NULL OR NEW.approved_revision IS NULL OR NEW.approved_hash<>NEW.hash OR NEW.approved_revision<>NEW.revision)
BEGIN SELECT RAISE(ABORT,'final revision approval required'); END;
CREATE TRIGGER IF NOT EXISTS require_approval_update BEFORE UPDATE ON articles
WHEN NEW.status IN('approved','scheduled','preparing','prepared','published') AND (NEW.approved_hash IS NULL OR NEW.approved_revision IS NULL OR NEW.approved_hash<>NEW.hash OR NEW.approved_revision<>NEW.revision)
BEGIN SELECT RAISE(ABORT,'final revision approval required'); END;

CREATE TABLE IF NOT EXISTS publication_permissions(article_id TEXT PRIMARY KEY REFERENCES articles(id),revision INTEGER NOT NULL,hash TEXT NOT NULL,granted_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS publication_attempts(article_id TEXT PRIMARY KEY REFERENCES articles(id),revision INTEGER NOT NULL,hash TEXT NOT NULL UNIQUE,note_key TEXT NOT NULL UNIQUE,nonce TEXT NOT NULL UNIQUE,stage TEXT NOT NULL CHECK(stage IN('armed','attempting','confirmed')),started_at TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS invalidate_publication_permission AFTER UPDATE ON articles WHEN OLD.revision<>NEW.revision OR OLD.hash<>NEW.hash OR NEW.approved_hash IS NULL BEGIN DELETE FROM publication_permissions WHERE article_id=NEW.id; END;

CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY,public_key TEXT NOT NULL,counter INTEGER NOT NULL,transports TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_challenges(id TEXT PRIMARY KEY,challenge TEXT NOT NULL,kind TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_rate(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS note_drafts(article_id TEXT PRIMARY KEY REFERENCES articles(id),revision INTEGER NOT NULL,hash TEXT NOT NULL,note_key TEXT NOT NULL UNIQUE,linked_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS publication_attempt_history(nonce TEXT PRIMARY KEY,article_id TEXT NOT NULL,revision INTEGER NOT NULL,hash TEXT NOT NULL,note_key TEXT NOT NULL,stage TEXT NOT NULL,started_at TEXT NOT NULL,resolved_at TEXT NOT NULL,resolution TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS archive_recovered_publication AFTER UPDATE ON articles WHEN NEW.actor='owner' AND NEW.status='draft' AND OLD.status IN('uncertain','failed','prepared') AND OLD.revision=NEW.revision AND OLD.hash=NEW.hash BEGIN
INSERT INTO publication_attempt_history SELECT nonce,article_id,revision,hash,note_key,stage,started_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'owner-confirmed-not-published' FROM publication_attempts WHERE article_id=NEW.id;
DELETE FROM publication_attempts WHERE article_id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS no_attempt_history_update BEFORE UPDATE ON publication_attempt_history BEGIN SELECT RAISE(ABORT,'attempt history immutable'); END;
CREATE TRIGGER IF NOT EXISTS no_attempt_history_delete BEFORE DELETE ON publication_attempt_history BEGIN SELECT RAISE(ABORT,'attempt history immutable'); END;

CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,mime TEXT NOT NULL,data TEXT NOT NULL,bytes INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TRIGGER IF NOT EXISTS no_media_update BEFORE UPDATE ON media BEGIN SELECT RAISE(ABORT,'media immutable'); END;
CREATE TRIGGER IF NOT EXISTS no_media_delete BEFORE DELETE ON media BEGIN SELECT RAISE(ABORT,'media immutable'); END;

CREATE TRIGGER IF NOT EXISTS require_images_insert BEFORE INSERT ON articles
WHEN NEW.status IN('approved','scheduled','preparing','prepared','published') AND json_array_length(NEW.images)=0
BEGIN SELECT RAISE(ABORT,'image required'); END;
CREATE TRIGGER IF NOT EXISTS require_images_update BEFORE UPDATE ON articles
WHEN NEW.status IN('approved','scheduled','preparing','prepared','published') AND json_array_length(NEW.images)=0
BEGIN SELECT RAISE(ABORT,'image required'); END;

CREATE TRIGGER IF NOT EXISTS require_separate_cover_insert BEFORE INSERT ON articles
WHEN NEW.status IN('approved','scheduled','preparing','prepared') AND (json_extract(NEW.cover,'$.id') IS NULL OR EXISTS(SELECT 1 FROM json_each(NEW.images) WHERE json_extract(value,'$.id')=json_extract(NEW.cover,'$.id')))
BEGIN SELECT RAISE(ABORT,'separate cover required'); END;
CREATE TRIGGER IF NOT EXISTS require_separate_cover_update BEFORE UPDATE ON articles
WHEN NEW.status IN('approved','scheduled','preparing','prepared') AND (json_extract(NEW.cover,'$.id') IS NULL OR EXISTS(SELECT 1 FROM json_each(NEW.images) WHERE json_extract(value,'$.id')=json_extract(NEW.cover,'$.id')))
BEGIN SELECT RAISE(ABORT,'separate cover required'); END;
