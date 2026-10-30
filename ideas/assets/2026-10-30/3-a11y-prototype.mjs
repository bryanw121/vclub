import { readFileSync, writeFileSync } from 'node:fs'
const R='/home/claude/vteam/scripts/shots/'
const { SCREENS } = await import(R+'screens.mjs')
const { serveDist } = await import(R+'lib/server.mjs')
const { installSupabaseMock } = await import(R+'lib/supabaseMock.mjs')
const { loadRelationships, loadSeenIds } = await import(R+'lib/schema.mjs')
const { defaultNow, TIME_ZONE } = await import(R+'fixtures/time.mjs')
const { launchChromium, VIEWPORTS } = await import(R+'capture.mjs')
const axe = readFileSync('/tmp/claude-0/axe/node_modules/axe-core/axe.min.js','utf8')
const src='/home/claude/vteam', now=defaultNow()
const rel=loadRelationships(src), seen=loadSeenIds(src)
const server=await serveDist(src+'/dist'); const browser=await launchChromium()
const names=process.argv.slice(2).length?process.argv.slice(2):Object.keys(SCREENS)
const out={}
for (const n of names){ const s=SCREENS[n]
  const ctx=await browser.newContext({...VIEWPORTS.mobile,locale:'en-US',timezoneId:TIME_ZONE,reducedMotion:'reduce',serviceWorkers:'block'})
  await ctx.clock.install({time:now}); const page=await ctx.newPage()
  await installSupabaseMock(page,{now,signedIn:s.signedIn!==false,seenIds:seen,relationships:rel})
  try{ await page.goto(server.url+s.route,{waitUntil:'load',timeout:30000})
    if(s.ready) await page.getByText(s.ready,{exact:false}).first().waitFor({state:'visible',timeout:15000}).catch(()=>{})
    await page.waitForTimeout(3000)
    await page.addScriptTag({content:axe})
    const r=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}))
    out[n]=r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,sample:v.nodes[0]?.failureSummary?.split('\n').slice(0,2).join(' ').slice(0,160)}))
  }catch(e){out[n]={error:e.message.slice(0,200)}}
  await ctx.close(); process.stderr.write('.'+n)
}
await browser.close(); await server.close()
writeFileSync('/tmp/claude-0/proto/a11y.json',JSON.stringify(out,null,1))
