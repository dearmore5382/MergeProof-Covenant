from pathlib import Path
from unittest.mock import patch
from datetime import datetime
import importlib,json,sys,pytest
from gltest.direct import VMContext,create_address,deploy_contract
ROOT=Path(__file__).resolve().parents[1];FILE=ROOT/'contracts/MergeProofCovenant.py'
def eth(a):return'0x'+(a if isinstance(a,bytes)else a.as_bytes).hex()
@pytest.fixture
def env():
 sponsor,contributor,stranger=[create_address(x) for x in('sponsor','contributor','stranger')];vm=VMContext(sponsor);vm.warp('2026-10-15T00:00:00Z')
 with patch('os.unlink',lambda _:None),vm.activate():
  c=deploy_contract(FILE,vm);gl=c._instance.create_covenant.__globals__['gl'];_=gl.nondet;_=gl.vm;sdk=Path(gl._cached_gl.__file__).resolve().parents[2];sys.path.insert(0,str(sdk)) if str(sdk)not in sys.path else None;importlib.import_module('genlayer');_=gl.nondet.web;_=gl.eq_principle
 with vm.activate():sync(vm,c);yield vm,c,sponsor,contributor,stranger
def sync(vm,c):
 gl=c._instance.create_covenant.__globals__['gl'];sender=type(gl.message.sender_address)(vm.sender)if isinstance(vm.sender,bytes)else vm.sender;gl._cached_gl.message=gl.message._replace(sender_address=sender,origin_address=sender,value=type(gl.message.value)(vm.value));gl._cached_gl.message_raw['datetime']=vm._datetime
def call(e,actor,name,*args,value=0):
 vm,c,*_=e
 with vm.activate(),vm.prank(actor):vm.value=value;sync(vm,c);return getattr(c,name)(*args)
def ts(x):return int(datetime.fromisoformat('2026-10-15T'+x+'+00:00').timestamp())
def terms(e):return{'title':'Fix exact authorization regression','contributor':eth(e[3]),'repo':'acme/protocol','base_branch':'main','production_prefix':'src/','test_prefix':'tests/','criteria':['Production authorization checks reject unauthorized callers.','Regression tests exercise the rejected transaction path.'],'budget':1000,'partial_bps':5000,'proof_deadline':ts('00:10:00'),'challenge_end':ts('00:20:00'),'expires':ts('00:30:00')}
def funded(e):
 cid=call(e,e[2],'create_covenant',json.dumps(terms(e)));assert call(e,e[2],'fund',cid,value=1000)=='FUNDED';e[0].deal(e[0]._contract_address,1000);return cid
def artifact(path,digest,content):return{'path':path,'status':'modified','previous_filename':'','additions':1,'deletions':1,'changes':2,'patch':'@@ -1 +1 @@\n-old\n+'+content,'patch_sha256':'e'*64,'sha256':digest,'content':content}
def snapshot(sha='a'*40,prod=True,tests=True):return{'repo':'acme/protocol','pr':7,'base':'main','merge_sha':sha,'head_sha':'b'*40,'production':['src/auth.ts']if prod else[],'tests':['tests/auth.test.ts']if tests else[],'changed':['src/auth.ts','tests/auth.test.ts'],'artifacts':[artifact('src/auth.ts','c'*64,'export const authorize = sender => sender === owner'),artifact('tests/auth.test.ts','d'*64,'expect(authorize(stranger)).toBe(false)')]if prod and tests else[]}
def verified(e,outcome='SATISFIED',snap=None):
 cid=funded(e);call(e,e[3],'submit_merge',cid,7);mod=e[1]._instance.create_covenant.__globals__
 with patch.dict(mod,{'_github_snapshot':lambda *_:snap or snapshot(),'_assess':lambda *_:{'outcome':outcome,'matched':[0,1]if outcome=='SATISFIED'else([0]if outcome=='PARTIAL'else[])}}):assert call(e,e[4],'verify_merge',cid)==outcome
 return cid
def test_runner_and_no_deployer_privilege():
 source=FILE.read_text();assert source.splitlines()[:2]==['# v0.2.17','# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }']
 assert 'gl.eq_principle.strict_eq' not in source and source.count('gl.vm.run_nondet(')>=2 and 'CHALLENGE_ALREADY_USED' in source
def test_create_binds_sender_and_immutable_terms(env):
 cid=call(env,env[2],'create_covenant',json.dumps(terms(env)));v=env[1].get_covenant(cid);assert v['sponsor']==eth(env[2])and v['phase']=='DRAFT'and len(v['terms_digest'])==64
 for mutation in ({'contributor':'0x0'},{'repo':'bad/repo/extra'},{'production_prefix':'README.md'},{'test_prefix':'src/'}):
  bad=terms(env);bad.update(mutation)
  with pytest.raises(Exception):call(env,env[2],'create_covenant',json.dumps(bad))
def test_exact_funding_and_role_rollback(env):
 cid=call(env,env[2],'create_covenant',json.dumps(terms(env)));before=env[1].get_covenant(cid)
 for actor,amount in((env[4],1000),(env[2],999),(env[2],1001)):
  with pytest.raises(Exception):call(env,actor,'fund',cid,value=amount)
  assert env[1].get_covenant(cid)==before
 assert call(env,env[2],'fund',cid,value=1000)=='FUNDED'
def test_only_contributor_submits_before_deadline(env):
 cid=funded(env);before=env[1].get_covenant(cid)
 with pytest.raises(Exception):call(env,env[4],'submit_merge',cid,7)
 assert env[1].get_covenant(cid)==before
 env[0].warp('2026-10-15T00:10:00Z')
 with pytest.raises(Exception):call(env,env[3],'submit_merge',cid,7)
 assert env[1].get_covenant(cid)==before
def test_poisoned_document_only_and_missing_tests_fail_closed(env):
 for prod,tests in((False,True),(True,False)):
  cid=funded(env);call(env,env[3],'submit_merge',cid,7);mod=env[1]._instance.create_covenant.__globals__;s=snapshot(str(cid+1)*40,prod,tests)
  with patch.dict(mod,{'_github_snapshot':lambda *_:s,'_assess':lambda snap,*_:{'outcome':'INSUFFICIENT','matched':[]} if not snap['production']or not snap['tests']else None}):assert call(env,env[4],'verify_merge',cid)=='INSUFFICIENT'
  assert env[1].get_covenant(cid)['verdict']['result']['outcome']=='INSUFFICIENT'
def test_source_unavailable_never_grants_credit(env):
 cid=funded(env);call(env,env[3],'submit_merge',cid,7);mod=env[1]._instance.create_covenant.__globals__
 with patch.dict(mod,{'_github_snapshot':lambda *_:(_ for _ in()).throw(ValueError('down'))}):assert call(env,env[4],'verify_merge',cid)=='SOURCE_UNAVAILABLE'
 assert env[1].get_covenant(cid)['credits']=={}
def test_verified_storage_keeps_patch_and_blob_digests_not_unbounded_source(env):
 cid=verified(env);artifacts=env[1].get_covenant(cid)['verdict']['snapshot']['artifacts'];assert artifacts and all('patch_sha256' in x and 'sha256' in x and 'patch' not in x and 'content' not in x for x in artifacts)
def test_github_file_pagination_fails_closed_when_truncated(env):
 mod=env[1]._instance.create_covenant.__globals__
 def fake(url):
  if '/pulls/7/files?' in url:return [{'filename':f'src/f{i}.ts'} for i in range(100)]
  if '/pulls/7' in url:return {'merged':True,'state':'closed','base':{'ref':'main'},'merge_commit_sha':'a'*40,'head':{'sha':'b'*40}}
  if '/commits/' in url:return {'sha':'a'*40}
  raise AssertionError(url)
 with patch.dict(mod,{'_read_json':fake}):
  with pytest.raises(ValueError,match='FILES_TRUNCATED'):mod['_github_snapshot']('acme/protocol',7,'main','src/','tests/')
def test_adjudication_evidence_is_bound_to_pr_patches(env):
 mod=env[1]._instance.create_covenant.__globals__;rows=[{'filename':'src/auth.ts','status':'modified','additions':1,'deletions':1,'changes':2,'patch':'@@ -1 +1 @@\n-old\n+new'},{'filename':'tests/auth.test.ts','status':'added','additions':1,'deletions':0,'changes':1,'patch':'@@ -0,0 +1 @@\n+test'}]
 def fake(url):
  if '/pulls/7/files?' in url:return rows
  if '/pulls/7' in url:return {'merged':True,'state':'closed','base':{'ref':'main'},'merge_commit_sha':'a'*40,'head':{'sha':'b'*40}}
  if '/commits/' in url:return {'sha':'a'*40}
  raise AssertionError(url)
 with patch.dict(mod,{'_read_json':fake,'_read_blob':lambda repo,sha,path:{'path':path,'sha256':'c'*64,'content':'post merge context'}}):
  snap=mod['_github_snapshot']('acme/protocol',7,'main','src/','tests/');assert all(x['patch'] and len(x['patch_sha256'])==64 for x in snap['artifacts'])
  rows[0].pop('patch')
  with pytest.raises(ValueError,match='PR_PATCH_UNAVAILABLE'):mod['_github_snapshot']('acme/protocol',7,'main','src/','tests/')
def test_challenge_is_single_bounded_recheck(env):
 cid=verified(env);assert call(env,env[4],'challenge',cid,'c'*64)=='CHALLENGED';state=env[1].get_covenant(cid)
 with pytest.raises(Exception):call(env,env[4],'challenge',cid,'d'*64)
 assert env[1].get_covenant(cid)==state
 mod=env[1]._instance.create_covenant.__globals__
 with patch.dict(mod,{'_github_snapshot':lambda *_:snapshot(),'_assess':lambda *_:{'outcome':'SATISFIED','matched':[0,1]}}):assert call(env,env[4],'resolve_challenge',cid)=='SATISFIED'
 state=env[1].get_covenant(cid)
 with pytest.raises(Exception):call(env,env[4],'challenge',cid,'e'*64)
 assert env[1].get_covenant(cid)==state
def test_late_challenge_can_resolve_after_challenge_deadline(env):
 cid=verified(env,snap=snapshot('9'*40));env[0].warp('2026-10-15T00:19:59Z');assert call(env,env[4],'challenge',cid,'f'*64)=='CHALLENGED';env[0].warp('2026-10-15T00:20:01Z');mod=env[1]._instance.create_covenant.__globals__
 with patch.dict(mod,{'_github_snapshot':lambda *_:snapshot('9'*40),'_assess':lambda *_:{'outcome':'SATISFIED','matched':[0,1]}}):assert call(env,env[4],'resolve_challenge',cid)=='SATISFIED'
 assert env[1].get_covenant(cid)['phase']=='VERIFIED'
def test_finalize_deterministic_full_partial_and_refund(env):
 for outcome,award in(('SATISFIED',1000),('PARTIAL',500),('INSUFFICIENT',0)):
  cid=verified(env,outcome,snapshot(str(cid if 'cid'in locals()else 5)*40));env[0].warp('2026-10-15T00:20:00Z');assert call(env,env[4],'finalize',cid)==outcome;v=env[1].get_covenant(cid);assert v['credits'].get(eth(env[3]),{}).get('amount',0)==award;assert sum(x['amount']for x in v['credits'].values())==1000
  env[0].warp('2026-10-15T00:00:00Z')
def test_same_address_partial_credit_is_combined_without_value_loss(env):
 t=terms(env);t['contributor']=eth(env[2]);cid=call(env,env[2],'create_covenant',json.dumps(t));call(env,env[2],'fund',cid,value=1000);env[0].deal(env[0]._contract_address,1000);call(env,env[2],'submit_merge',cid,7);mod=env[1]._instance.create_covenant.__globals__
 with patch.dict(mod,{'_github_snapshot':lambda *_:snapshot('8'*40),'_assess':lambda *_:{'outcome':'PARTIAL','matched':[0]}}):assert call(env,env[4],'verify_merge',cid)=='PARTIAL'
 env[0].warp('2026-10-15T00:20:00Z');assert call(env,env[4],'finalize',cid)=='PARTIAL';v=env[1].get_covenant(cid);credit=v['credits'][eth(env[2])];assert credit['kind']=='COMBINED' and credit['amount']==1000 and credit['payout_amount']==500 and credit['refund_amount']==500
def test_finalize_before_challenge_end_no_mutation(env):
 cid=verified(env);before=env[1].get_covenant(cid)
 with pytest.raises(Exception):call(env,env[4],'finalize',cid)
 assert env[1].get_covenant(cid)==before
def test_verification_and_finalization_close_at_deadlines(env):
 cid=funded(env);call(env,env[3],'submit_merge',cid,7);before=env[1].get_covenant(cid);env[0].warp('2026-10-15T00:20:00Z')
 with pytest.raises(Exception):call(env,env[4],'verify_merge',cid)
 assert env[1].get_covenant(cid)==before
 env[0].warp('2026-10-15T00:00:00Z');cid=verified(env,snap=snapshot('e'*40));env[0].warp('2026-10-15T00:30:00Z');before=env[1].get_covenant(cid)
 with pytest.raises(Exception):call(env,env[4],'finalize',cid)
 assert env[1].get_covenant(cid)==before
def test_same_merge_cannot_settle_twice_after_parallel_verification(env):
 first=verified(env,snap=snapshot('f'*40));second=verified(env,snap=snapshot('f'*40));env[0].warp('2026-10-15T00:20:00Z');assert call(env,env[4],'finalize',first)=='SATISFIED';before=env[1].get_covenant(second)
 with pytest.raises(Exception):call(env,env[4],'finalize',second)
 assert env[1].get_covenant(second)==before
def test_permissionless_expiry_recovery_refunds_sponsor(env):
 cid=funded(env);env[0].warp('2026-10-15T00:30:00Z');assert call(env,env[4],'recover_expired',cid)=='REFUND_AVAILABLE';v=env[1].get_covenant(cid);assert v['credits']=={eth(env[2]):{'amount':1000,'payout_amount':0,'refund_amount':1000,'kind':'REFUND','status':'AVAILABLE'}}
def test_native_payout_is_pending_not_falsely_paid(env):
 cid=verified(env);env[0].warp('2026-10-15T00:20:00Z');call(env,env[4],'finalize',cid);assert call(env,env[3],'request_payout',cid)=='TRANSFER_PENDING';v=env[1].get_covenant(cid);assert v['held']==0 and v['pending']==1000 and v['paid']==0 and v['credits'][eth(env[3])]['status']=='TRANSFER_PENDING'
 with pytest.raises(Exception):call(env,env[3],'request_payout',cid)
def test_transfer_proof_accepts_canonical_studionet_receipt_shape(env):
 mod=env[1]._instance.create_covenant.__globals__;parent='0x'+'1'*64;child='0x'+'2'*64;recipient=eth(env[3]);contract='0x'+'a'*40
 encoded=mod['base64'].b64encode(mod['calldata'].encode({'method':'request_payout','args':[0]})).decode()
 receipts={parent:{'hash':parent,'status':7,'statusName':'FINALIZED','to_address':contract,'from_address':recipient,'data':{'calldata':encoded},'triggered_transactions':[child]},child:{'hash':child,'status':7,'statusName':'FINALIZED','from_address':contract,'to_address':recipient,'value':'1000','triggered_by':parent,'value_credited':True}}
 with patch.dict(mod,{'_rpc_transaction':lambda h:receipts[h]}):assert mod['_transfer_proof'](contract,0,recipient,1000,parent,child) is True
 receipts[child]['to_address']=eth(env[4])
 with patch.dict(mod,{'_rpc_transaction':lambda h:receipts[h]}):
  with pytest.raises(ValueError,match='TRANSFER_BINDING'):mod['_transfer_proof'](contract,0,recipient,1000,parent,child)
