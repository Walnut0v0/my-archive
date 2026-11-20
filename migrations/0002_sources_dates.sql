ALTER TABLE entries ADD COLUMN links TEXT NOT NULL DEFAULT '[]';
ALTER TABLE entries ADD COLUMN backup_url TEXT NOT NULL DEFAULT '';
ALTER TABLE entries ADD COLUMN published_date TEXT NOT NULL DEFAULT '';
ALTER TABLE entries ADD COLUMN published_start TEXT NOT NULL DEFAULT '';
ALTER TABLE entries ADD COLUMN published_end TEXT NOT NULL DEFAULT '';
UPDATE entries SET links=json_array(json_object('platform',CASE
 WHEN instr(url,'weibo.')>0 THEN '微博' WHEN instr(url,'xiaohongshu.')>0 OR instr(url,'xhslink.')>0 THEN '小红书'
 WHEN instr(url,'bilibili.')>0 OR instr(url,'b23.tv')>0 THEN 'bilibili' WHEN instr(url,'douban.')>0 THEN '豆瓣'
 WHEN instr(url,'lofter.')>0 THEN 'Lofter' WHEN instr(url,'archiveofourown.')>0 THEN 'AO3' ELSE '原帖' END,'url',url)) WHERE url<>'';
CREATE INDEX entries_published ON entries(published_start,created_at);
