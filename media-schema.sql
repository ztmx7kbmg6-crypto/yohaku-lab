ALTER TABLE articles ADD COLUMN images TEXT NOT NULL DEFAULT '[]';
ALTER TABLE articles ADD COLUMN sources TEXT NOT NULL DEFAULT '[]';
ALTER TABLE revisions ADD COLUMN images TEXT NOT NULL DEFAULT '[]';
ALTER TABLE revisions ADD COLUMN sources TEXT NOT NULL DEFAULT '[]';
DROP TRIGGER article_create;
DROP TRIGGER article_revision;
CREATE TRIGGER IF NOT EXISTS article_create AFTER INSERT ON articles BEGIN
 INSERT INTO revisions VALUES(NEW.id,NEW.revision,NEW.title,NEW.body,NEW.price,NEW.paywall,NEW.tags,NEW.hash,NEW.updated_at,NEW.images,NEW.sources);
 INSERT INTO audit(article_id,action,actor,revision,hash) VALUES(NEW.id,'created',NEW.actor,NEW.revision,NEW.hash);
 INSERT INTO notifications(article_id,kind) VALUES(NEW.id,'created');
END;
CREATE TRIGGER IF NOT EXISTS article_revision AFTER UPDATE OF revision ON articles WHEN OLD.revision<>NEW.revision BEGIN
 INSERT INTO revisions VALUES(NEW.id,NEW.revision,NEW.title,NEW.body,NEW.price,NEW.paywall,NEW.tags,NEW.hash,NEW.updated_at,NEW.images,NEW.sources);
END;
CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,mime TEXT NOT NULL,data TEXT NOT NULL,bytes INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TRIGGER IF NOT EXISTS no_media_update BEFORE UPDATE ON media BEGIN SELECT RAISE(ABORT,'media immutable'); END;
CREATE TRIGGER IF NOT EXISTS no_media_delete BEFORE DELETE ON media BEGIN SELECT RAISE(ABORT,'media immutable'); END;

CREATE TRIGGER IF NOT EXISTS require_images_insert BEFORE INSERT ON articles
WHEN NEW.status IN('approved','scheduled','preparing','prepared','published') AND json_array_length(NEW.images)=0
BEGIN SELECT RAISE(ABORT,'image required'); END;
CREATE TRIGGER IF NOT EXISTS require_images_update BEFORE UPDATE ON articles
WHEN NEW.status IN('approved','scheduled','preparing','prepared','published') AND json_array_length(NEW.images)=0
BEGIN SELECT RAISE(ABORT,'image required'); END;
