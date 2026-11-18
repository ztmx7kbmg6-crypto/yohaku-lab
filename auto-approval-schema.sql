-- The owner action opts in by setting actor to owner-auto in its guarded reservation update.
CREATE TRIGGER IF NOT EXISTS grant_publication_on_auto_approval
AFTER UPDATE OF status ON articles
WHEN NEW.actor='owner-auto' AND NEW.status='scheduled' AND OLD.status IN('draft','revision_requested','rejected','approved')
BEGIN
 INSERT INTO publication_permissions(article_id,revision,hash,granted_at)
 VALUES(NEW.id,NEW.revision,NEW.hash,NEW.updated_at)
 ON CONFLICT(article_id) DO UPDATE SET revision=excluded.revision,hash=excluded.hash,granted_at=excluded.granted_at;
 INSERT INTO audit(article_id,action,actor,revision,hash)
 VALUES(NEW.id,'publication_authorized','owner',NEW.revision,NEW.hash);
END;
