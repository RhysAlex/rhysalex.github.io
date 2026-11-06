ALTER TABLE posts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private'));
ALTER TABLE posts ADD COLUMN public_data TEXT;
UPDATE posts SET public_data=json_object('id',id,'title',title,'summary',summary,'body',body,'category',category,'tags',tags,'status','published','visibility','public','project_ids',json('[]'),'published_at',published_at,'updated_at',updated_at) WHERE status='published';
CREATE TABLE projects (
 id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,title TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT '计划中',start_date TEXT NOT NULL DEFAULT '',end_date TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '[]',tech_stack TEXT NOT NULL DEFAULT '[]',source_url TEXT NOT NULL DEFAULT '',position INTEGER NOT NULL DEFAULT 0,visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('public','private')),public_data TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE post_projects (post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,PRIMARY KEY(post_id,project_id));
CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK(id=1),draft_json TEXT NOT NULL DEFAULT '{}',public_json TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL);
