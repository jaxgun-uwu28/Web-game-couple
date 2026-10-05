import {readFile,writeFile} from 'node:fs/promises';
const rules=JSON.parse(await readFile('src/lib/heartblast-rules.json','utf8'));
const path='supabase/migrations/012_activities_heartblast.sql';
const source=await readFile(path,'utf8');
const next=source.replace(/-- BEGIN CANONICAL RULES[\s\S]*?-- END CANONICAL RULES/,()=>`-- BEGIN CANONICAL RULES\ncreate or replace function heartblast_rules() returns jsonb language sql immutable as $$ select '${JSON.stringify(rules)}'::jsonb $$;\n-- END CANONICAL RULES`);
if(next!==source)await writeFile(path,next);
