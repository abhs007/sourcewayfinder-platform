"""Prepare unapproved account-recovery proposals from public source captures.
No policy registration, credentials, approvals or semantic acceptance execution.
"""
from pathlib import Path
from html.parser import HTMLParser
from datetime import datetime, timezone
import hashlib, json, urllib.request, re
root=Path(__file__).resolve().parents[1]
folder=root/'domains/research/account-recovery-2026-11-26'
if (folder/'capture-register.json').exists():
 raise SystemExit('Research captures already exist. Preserve them; use a new dated workspace for a later acquisition.')
sources=[('google-lost-factor','185834','Google: Fix common issues with 2-Step Verification','Another phone signed in to your Google Account.'),
 ('google-compromised','6294825','Google: Secure a hacked or compromised account','Someone changed your account info, like your password or recovery phone number.'),
 ('google-recovery','7682439','Google: Recover your Google Account or Gmail','Do not give out your passwords or verification codes.')]
class Text(HTMLParser):
 def __init__(self):super().__init__();self.skip=0;self.chunks=[]
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style'):self.skip+=1
 def handle_endtag(self,tag):
  if tag in ('script','style'):self.skip=max(0,self.skip-1)
 def handle_data(self,data):
  if not self.skip:self.chunks.append(data)
records=[]
for id,article,title,passage in sources:
 url=f'https://support.google.com/accounts/answer/{article}?hl=en'
 response=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30)
 raw=response.read(2*1024*1024)
 if len(raw)>=2*1024*1024:raise RuntimeError('Capture exceeds research bound')
 (folder/(id+'.html')).write_bytes(raw)
 parser=Text();parser.feed(raw.decode('utf-8'))
 normalized=re.sub(r'\s+',' ',' '.join(parser.chunks)).strip()
 if passage not in normalized:raise RuntimeError('Required passage absent: '+id)
 (folder/(id+'.txt')).write_text(normalized+'\n')
 digest=hashlib.sha256(raw).hexdigest()
 records.append({'id':id,'sourceVersionId':'draft_'+digest[:58],'snapshotSha256':digest,'url':url,'title':title,'passage':passage,
  'acquiredAt':datetime.now(timezone.utc).isoformat(),'finalUrl':response.url,'httpStatus':response.status,'rawBytes':len(raw),'productionCollectorCompatible':len(raw)<=1024*1024,
  'rawFile':str((folder/(id+'.html')).relative_to(root)), 'textFile':str((folder/(id+'.txt')).relative_to(root)),
  'versionStatus':'Provisional research identity only; not registered or approved by the policy service.',
  'extractor':'stdlib-htmlparser-prose-v1; all non-script/style text, not the production collector'})
(folder/'capture-register.json').write_text(json.dumps(records,indent=2)+'\n')
byid={x['id']:x for x in records}
def source(id):return {k:byid[id][k] for k in ['id','sourceVersionId','snapshotSha256','url','title','passage']}
def q(id,prompt,choices,help=None):
 value={'id':id,'prompt':prompt,'choices':[{'id':a,'label':b} for a,b in choices]}
 if help:value['help']=help
 return value
scope=q('account-scope','Is this your own personal Google account, as an adult?',[
 ('personal','Yes, my personal account'),('managed','It is a work, school or managed account'),('other','It is for a child or someone else'),('unknown','I am not sure')],
 'This guide never asks for an email address, password, recovery code or identity document.')
def outcome(id,title,nextStep,refs,prerequisites=None,unresolved=None):return {'id':id,'title':title,'nextStep':nextStep,'prerequisites':prerequisites or [],'unresolved':unresolved or ['Google determines which verification and recovery options are available.'],'sourceRefs':refs}
shared=[outcome('managed-account','Check with your account administrator','Google notes that personal-account recovery steps may not work for work, school or other managed accounts. Check the official guidance and contact your administrator.',['google-recovery']),
 outcome('outside-scope','Use the official route for that account','This draft is limited to an adult recovering their own personal Google account. Open Google’s account help for the appropriate route.',['google-recovery']),
 outcome('confirm-scope','Confirm which account needs help','Check whether the account is personal or managed before choosing a recovery process. Use Google’s official account help if you are unsure.',['google-recovery'])]
def edge(qid,cid,target,question=False):return {'questionId':qid,'choiceId':cid,'targetType':'question' if question else 'outcome','targetId':target}
base=[edge('account-scope','managed','managed-account'),edge('account-scope','other','outside-scope'),edge('account-scope','unknown','confirm-scope')]
lost=[scope,q('password','Do you remember your Google password?',[('yes','Yes'),('no','No'),('unknown','I am not sure')]),
 q('advanced','Is the account enrolled in Google Advanced Protection?',[('yes','Yes'),('no','No'),('unknown','I am not sure')]),
 q('backup-method','Which previously set-up sign-in option can you still access?',[
 ('device','Another phone already signed in'),('code','A backup code I previously saved'),('key','A registered hardware security key'),('passkey','A passkey on another device'),('number','Another registered verification phone number'),('none','None of these'),('unknown','I am not sure')],
 'Select only an option you already have. Enter codes only on Google’s own sign-in pages.')]
outs=shared+[outcome('recovery','Use Google’s account recovery process','Follow Google’s recovery process and answer its ownership questions. Do not share passwords or verification codes with this site or a third-party recovery service.',['google-recovery']),
 outcome('check-advanced','Check Google’s Advanced Protection instructions','Use Google’s official second-step help for Advanced Protection before choosing a recovery method. This draft does not apply the ordinary backup-options branch to that account.',['google-lost-factor'],unresolved=['Advanced Protection may require a different recovery route.']),
 outcome('check-method','Review which verification options you have','Open Google’s official second-step help to identify an option you previously set up. If none is available, follow its account recovery route.',['google-lost-factor','google-recovery'])]
methods=[('device','another phone already signed in'),('code','a previously saved backup code'),('key','a registered hardware security key'),('passkey','a passkey on another device'),('number','another verification phone number previously added to the account')]
for id,label in methods:
 outs.append(outcome('use-'+id,'Try your available Google verification option','Google lists '+label+' as a possible second-step option. Use Google’s sign-in process to try it. Once you regain access, follow its lost-phone security instructions.',['google-lost-factor'],['You remember the password and can access '+label+'.','This branch excludes Advanced Protection.']))
edges=base+[edge('account-scope','personal','password',True),edge('password','yes','advanced',True),edge('password','no','recovery'),edge('password','unknown','recovery'),edge('advanced','yes','check-advanced'),edge('advanced','unknown','check-advanced'),edge('advanced','no','backup-method',True)]
edges += [edge('backup-method',id,'use-'+id) for id,_ in methods]+[edge('backup-method','none','recovery'),edge('backup-method','unknown','check-method')]
def save(id,scope,questions,transitions,outcomes,refs,reason):
 directory=root/'domains'/id;directory.mkdir(exist_ok=True)
 bundle={'schemaVersion':'1.0','usage':'production_candidate','flowId':id,'scope':scope,'entryQuestionId':'account-scope','questions':questions,'transitions':transitions,'outcomes':outcomes,'sources':[source(s) for s in refs]}
 (directory/'bundle.draft.json').write_text(json.dumps(bundle,indent=2)+'\n')
 cases=[]
 def walk(current,answers):
  for e in [x for x in transitions if x['questionId']==current]:
   path=answers+[{'questionId':current,'choiceId':e['choiceId']}]
   if e['targetType']=='question':walk(e['targetId'],path)
   else:cases.append({'id':'case-'+str(len(cases)+1).zfill(2),'answers':path,'expectedOutcomeId':e['targetId'],'reviewStatus':'proposed; human review required'})
 walk('account-scope',[])
 (directory/'expected-cases.proposed.json').write_text(json.dumps(cases,indent=2)+'\n')
 (directory/'review-packet.json').write_text(json.dumps({'status':'UNAPPROVED_RESEARCH_DRAFT','createdAt':datetime.now(timezone.utc).isoformat(),'feedbackConnection':reason,'scope':scope,'structuralCounts':{'questions':len(questions),'outcomes':len(outcomes),'transitions':len(transitions),'proposedCases':len(cases)},'sourceIdentityNote':'draft_ identities are provisional; replace using the approved production collector before interpretation submission.','approvals':[],'semanticTestsRun':False,'releaseReady':False},indent=2)+'\n')
 rows=['# '+id+' — review draft','',scope,'','## Proposed cases','', '| Case | Selections | Proposed outcome |','|---|---|---|']
 for c in cases:rows.append('| '+c['id']+' | '+'; '.join(a['questionId']+'='+a['choiceId'] for a in c['answers'])+' | '+c['expectedOutcomeId']+' |')
 rows+=['','## Source and review boundaries','',reason,'','Each question, choice and outcome is in bundle.draft.json. All branches, including unknown answers, are listed above. Proposed targets were enumerated structurally; the semantic acceptance runner has not been run.','', 'Research captures and selected passages: ../research/account-recovery-2026-11-26/capture-register.json. The full Google pages, rather than the feedback blueprint, govern this proposal. Source passages are minimal trace anchors; an owner must review the complete relevant sections, all outcome wording and source bindings.','', 'Before guided release: register approved source boundaries; acquire with the production collector; replace provisional source identities; review interpretation and exact expected answers; execute the newly authorized candidate; follow merge, deployment, verification and activation gates. No existing Verizon decision or test result is inherited.']
 (directory/'REVIEW.md').write_text('\n'.join(rows)+'\n')
save('google-lost-second-factor','English guidance for an adult with their own personal Google account whose primary phone or usual second step is unavailable. Excludes managed accounts, child/representative recovery and detailed Advanced Protection recovery.',lost,edges,outs,['google-lost-factor','google-recovery'],'Feedback suggested account lockouts and lost 2FA recovery. Do not implement the blueprint’s universal password-before-device-erase order or any promise of immediate recovery.')
comp=[scope,q('can-sign-in','Can you sign in to the Google account now?',[('yes','Yes'),('no','No'),('unknown','I am not sure')]),
 q('concern','What makes you think someone else may have accessed it?',[('activity','An unfamiliar security event'),('device','A device I do not recognize'),('other','Something else or I am not sure'),('unknown','I do not know')])]
couts=shared+[outcome('recover-access','Start with Google’s account recovery route','If you cannot sign in, use the account recovery link in Google’s compromised-account guide. Recovery options and ownership checks are controlled by Google.',['google-compromised','google-recovery']),
 outcome('check-access','Check access through Google’s official help','Start with Google’s compromised-account guide and confirm whether you can sign in. Do not assume that a current session proves nobody else has access.',['google-compromised']),
 outcome('review-events','Review unfamiliar security activity','Follow Google’s compromised-account instructions to review recent security events and respond to activity you do not recognize. Follow the guide’s password and additional security steps.',['google-compromised']),
 outcome('review-devices','Review devices using your account','Use Google’s compromised-account guide to review connected devices and follow its steps for devices you do not recognize. Continue with its password and additional security checks.',['google-compromised']),
 outcome('review-security','Use Google’s full compromised-account checklist','Review the warning signs and security checklist on Google’s official compromised-account page. This flow does not diagnose whether an account was hacked or establish that it is secure.',['google-compromised'])]
ce=base+[edge('account-scope','personal','can-sign-in',True),edge('can-sign-in','yes','concern',True),edge('can-sign-in','no','recover-access'),edge('can-sign-in','unknown','check-access')]+[edge('concern',id,target) for id,target in [('activity','review-events'),('device','review-devices'),('other','review-security'),('unknown','review-security')]]
save('google-compromised-account','English guidance for an adult securing their own personal Google account or Gmail after suspected unauthorized activity. It selects an official recovery or review route; it does not diagnose compromise, assess financial loss or guarantee account security.',comp,ce,couts,['google-compromised','google-recovery'],'Feedback suggested primary-email compromise triage. The user’s ability to sign in changes the official starting point; uncertainty remains an explicit handoff.')
print('Prepared two unapproved bundles and branch inventories. No semantic acceptance test, approval or deployment executed.')
