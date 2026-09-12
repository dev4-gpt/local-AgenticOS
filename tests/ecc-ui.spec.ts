import {test,expect} from '@playwright/test';
import {eccCatalog,ECC_DEPARTMENTS,ECC_ADAPTERS} from '../src/lib/eccCatalog';
import {runEccAdapter} from '../src/lib/eccAdapter';

test('existing sections expose catalog filters, exact lesson review and real artifact controls',async({page},testInfo)=>{
  const reviewed:string[]=[]; const queued:unknown[]=[];
  const item={id:'00000000-0000-4000-8000-000000000001',created_by:'user-a',content:{summary:'Preserve source evidence.',trigger:'Before release.',action:'Attach the real test results.',evidenceReferences:['record:1'],sourceHashes:['a'.repeat(64)]},content_hash:'b'.repeat(64),revision:1,confidence:0,status:'proposed',reviewed_by:null,retention_expires_at:'2030-01-01T00:00:00Z',source_job_id:null,source_record_id:null};
  const result=runEccAdapter({adapterId:'ecc-research-plan',brief:'Compare primary sources.'},{tenantSlug:'tenant-a',enabled:true,role:'member'});
  if(!result.ok)throw new Error(result.error);
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());let body:unknown={ok:true};
    if(url.pathname==='/api/client-runtime/learning'){
      if(route.request().method()==='PATCH'){const sent=route.request().postDataJSON();reviewed.push(sent.expectedHash);item.status='approved';}
      else body=url.searchParams.has('active')?{ok:true,revisions:[]}:{ok:true,role:'owner',userId:'user-a',items:[item]};
    }else if(url.pathname==='/api/client-runtime/skills')body={ok:true,ecc:{components:eccCatalog(true),departments:ECC_DEPARTMENTS,adapters:ECC_ADAPTERS}};
    else if(url.pathname==='/api/client-runtime/ecc'){
      if(route.request().method()==='POST'){queued.push(route.request().postDataJSON());body={ok:true,jobId:'job-ui',status:'queued'};}
      else body={ok:true,role:'owner',runtimeEnabled:true,policyEnabled:true,jobs:[{id:'job-ui',status:'succeeded',created_at:'2026-09-11T12:00:00Z',error_code:null,output_metadata:{...result,artifactId:'artifact-ui'}}]};
    }else if(url.pathname==='/api/capabilities')body={ok:true,capabilities:[]};
    await route.fulfill({json:body});
  });
  await page.goto('/context');await expect(page.getByRole('heading',{name:'Learning',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Approve this exact content'}).click();expect(reviewed).toEqual(['b'.repeat(64)]);
  await expect(page.getByText('approved',{exact:true})).toBeVisible();
  await page.goto('/capabilities');await page.getByRole('button',{name:'Skills & Specialists',exact:true}).click();
  await page.getByLabel('Search ECC catalog').fill('search first');await expect(page.getByText('search first',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Evaluations',exact:true}).click();await expect(page.getByText('missing',{exact:true})).toBeVisible();
  await page.goto('/orchestrate');await page.getByLabel('Workflow department').selectOption('research');await page.getByLabel('Outcome and constraints',{exact:true}).first().fill('Compare the primary sources and record missing evidence.');
  await page.getByRole('button',{name:'Create review artifact'}).click();expect(queued).toHaveLength(1);expect((queued[0] as any).input.adapterId).toBe('ecc-research-plan');
  await expect(page.getByRole('button',{name:'Download artifact JSON'})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('ecc-department-workflow.png'),fullPage:true});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download artifact JSON'}).click();expect((await download).suggestedFilename()).toBe('job-ui.json');
});
