ALTER TABLE articles ADD COLUMN cover TEXT NOT NULL DEFAULT 'null';
ALTER TABLE revisions ADD COLUMN cover TEXT NOT NULL DEFAULT 'null';
DROP TRIGGER article_create;
DROP TRIGGER article_revision;
CREATE TRIGGER IF NOT EXISTS article_create AFTER INSERT ON articles BEGIN
 INSERT INTO revisions VALUES(NEW.id,NEW.revision,NEW.title,NEW.body,NEW.price,NEW.paywall,NEW.tags,NEW.hash,NEW.updated_at,NEW.images,NEW.sources,NEW.cover);
 INSERT INTO audit(article_id,action,actor,revision,hash) VALUES(NEW.id,'created',NEW.actor,NEW.revision,NEW.hash);
 INSERT INTO notifications(article_id,kind) VALUES(NEW.id,'created');
END;
CREATE TRIGGER IF NOT EXISTS article_revision AFTER UPDATE OF revision ON articles WHEN OLD.revision<>NEW.revision BEGIN
 INSERT INTO revisions VALUES(NEW.id,NEW.revision,NEW.title,NEW.body,NEW.price,NEW.paywall,NEW.tags,NEW.hash,NEW.updated_at,NEW.images,NEW.sources,NEW.cover);
END;
CREATE TRIGGER IF NOT EXISTS require_separate_cover_insert BEFORE INSERT ON articles
WHEN NEW.status IN('approved','scheduled','preparing','prepared') AND (json_extract(NEW.cover,'$.id') IS NULL OR EXISTS(SELECT 1 FROM json_each(NEW.images) WHERE json_extract(value,'$.id')=json_extract(NEW.cover,'$.id')))
BEGIN SELECT RAISE(ABORT,'separate cover required'); END;
CREATE TRIGGER IF NOT EXISTS require_separate_cover_update BEFORE UPDATE ON articles
WHEN NEW.status IN('approved','scheduled','preparing','prepared') AND (json_extract(NEW.cover,'$.id') IS NULL OR EXISTS(SELECT 1 FROM json_each(NEW.images) WHERE json_extract(value,'$.id')=json_extract(NEW.cover,'$.id')))
BEGIN SELECT RAISE(ABORT,'separate cover required'); END;
