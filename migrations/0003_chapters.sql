CREATE TABLE chapters (
 id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
 position INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
 word_count INTEGER NOT NULL DEFAULT 0, UNIQUE(entry_id,position)
);
CREATE INDEX chapters_entry ON chapters(entry_id,position);
INSERT INTO chapters(id,entry_id,position,title,content,word_count)
 SELECT 'legacy-'||id,id,0,'正文',content,
 length(replace(replace(replace(replace(replace(content,' ',''),char(9),''),char(10),''),char(13),''),char(160),''))
 FROM entries WHERE type='fiction' AND content<>'';
