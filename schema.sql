
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),paused INTEGER NOT NULL DEFAULT 1,heartbeat TEXT);
INSERT OR IGNORE INTO settings(id) VALUES(1);
CREATE TABLE IF NOT EXISTS articles(
 id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,price INTEGER NOT NULL CHECK(price IN(0,200)),
 paywall INTEGER NOT NULL DEFAULT 0 CHECK(paywall>=0),tags TEXT NOT NULL DEFAULT '[]',
 revision INTEGER NOT NULL DEFAULT 1,hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','revision_requested','rejected','approved','scheduled','preparing','prepared','failed','uncertain','published')),
 approved_hash TEXT,approved_revision INTEGER,scheduled_at TEXT,lease TEXT,lease_until TEXT,
 public_url TEXT,error TEXT,actor TEXT NOT NULL,updated_at TEXT NOT NULL,
 CHECK(approved_hash IS NULL OR (approved_hash=hash AND approved_revision=revision)),
 CHECK(status NOT IN('approved','scheduled','preparing','prepared','published') OR approved_hash=hash)
);
CREATE TABLE IF NOT EXISTS revisions(article_id TEXT NOT NULL,revision INTEGER NOT NULL,title TEXT,body TEXT,price INTEGER,paywall INTEGER,tags TEXT,hash TEXT,created_at TEXT,PRIMARY KEY(article_id,revision));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,article_id TEXT,action TEXT NOT NULL,actor TEXT NOT NULL,revision INTEGER,hash TEXT,detail TEXT,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY AUTOINCREMENT,article_id TEXT NOT NULL REFERENCES articles(id),revision INTEGER NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS subscriptions(endpoint TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,article_id TEXT,kind TEXT NOT NULL,delivered INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX IF NOT EXISTS due_articles ON articles(status,scheduled_at);
CREATE TRIGGER IF NOT EXISTS article_create AFTER INSERT ON articles BEGIN
 INSERT INTO revisions VALUES(NEW.id,NEW.revision,NEW.title,NEW.body,NEW.price,NEW.paywall,NEW.tags,NEW.hash,NEW.updated_at);
 INSERT INTO audit(article_id,action,actor,revision,hash) VALUES(NEW.id,'created',NEW.actor,NEW.revision,NEW.hash);
 INSERT INTO notifications(article_id,kind) VALUES(NEW.id,'created');
END;
CREATE TRIGGER IF NOT EXISTS article_change AFTER UPDATE ON articles BEGIN
 INSERT INTO audit(article_id,action,actor,revision,hash,detail) VALUES(NEW.id,CASE WHEN OLD.revision<>NEW.revision THEN 'revised' ELSE NEW.status END,NEW.actor,NEW.revision,NEW.hash,NEW.error);
 INSERT INTO notifications(article_id,kind) VALUES(NEW.id,CASE WHEN OLD.revision<>NEW.revision THEN 'revised' ELSE NEW.status END);
END;
CREATE TRIGGER IF NOT EXISTS article_revision AFTER UPDATE OF revision ON articles WHEN OLD.revision<>NEW.revision BEGIN
 INSERT INTO revisions VALUES(NEW.id,NEW.revision,NEW.title,NEW.body,NEW.price,NEW.paywall,NEW.tags,NEW.hash,NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS settings_change AFTER UPDATE OF paused ON settings BEGIN
 INSERT INTO audit(action,actor,detail) VALUES('pause_changed','owner',CAST(NEW.paused AS TEXT));
END;
CREATE TRIGGER IF NOT EXISTS no_audit_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit immutable'); END;
CREATE TRIGGER IF NOT EXISTS no_audit_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit immutable'); END;
CREATE TRIGGER IF NOT EXISTS no_revision_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'revision immutable'); END;
CREATE TRIGGER IF NOT EXISTS no_revision_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'revision immutable'); END;
