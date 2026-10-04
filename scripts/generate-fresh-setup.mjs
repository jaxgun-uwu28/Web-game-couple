import {readFile,writeFile} from 'node:fs/promises';
const files=['001_arcade.sql','002_stage_one.sql','003_stage_two.sql'];
const foundation=(await readFile(`supabase/migrations/${files[0]}`,'utf8'))
  .replace("anniversary date not null default '2025-09-06'",'anniversary date')
  .replace('This invitation is only for Lance and Elaine.','Your private couple invitation is required.');
const later=await Promise.all(files.slice(1).map(f=>readFile(`supabase/migrations/${f}`,'utf8')));
await writeFile('supabase/setup_fresh_project.sql',`-- Fresh project only. Run this entire file ONCE in Supabase SQL Editor.
-- If a creation statement fails, the transaction rolls back. Do not run this on the old project.
-- Includes migrations 001, 002 and 003; do not run them separately afterward.
begin;
${[foundation,...later].join('\n\n')}
notify pgrst,'reload schema';
commit;
`);
console.log('Generated supabase/setup_fresh_project.sql');
