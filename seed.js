// Seed test sessions for automated testing
const fs=require('fs'),crypto=require('crypto'),{MongoClient}=require('mongodb')
const env=Object.fromEntries(fs.readFileSync('/app/.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const sha256=v=>crypto.createHash('sha256').update(String(v)).digest('hex')
;(async()=>{
  const c=new MongoClient(env.MONGO_URL);
  await c.connect();
  const db=c.db(env.DB_NAME)
  
  // Seed testnurse1 with TESTTOKEN1
  await db.collection('users').updateOne(
    {id:'testnurse1'},
    {$set:{id:'testnurse1',email:'nurse1@test.dev',name:'Test Nurse One',picture:null,updatedAt:new Date()},$setOnInsert:{createdAt:new Date()}},
    {upsert:true}
  )
  await db.collection('user_sessions').updateOne(
    {token_hash:sha256('TESTTOKEN1')},
    {$set:{token_hash:sha256('TESTTOKEN1'),user_id:'testnurse1',expires_at:new Date(Date.now()+7*864e5),createdAt:new Date()}},
    {upsert:true}
  )
  console.log('✅ Seeded nc_session=TESTTOKEN1 (testnurse1)')
  
  // Seed testnurse2 with TESTTOKEN2
  await db.collection('users').updateOne(
    {id:'testnurse2'},
    {$set:{id:'testnurse2',email:'nurse2@test.dev',name:'Test Nurse Two',picture:null,updatedAt:new Date()},$setOnInsert:{createdAt:new Date()}},
    {upsert:true}
  )
  await db.collection('user_sessions').updateOne(
    {token_hash:sha256('TESTTOKEN2')},
    {$set:{token_hash:sha256('TESTTOKEN2'),user_id:'testnurse2',expires_at:new Date(Date.now()+7*864e5),createdAt:new Date()}},
    {upsert:true}
  )
  console.log('✅ Seeded nc_session=TESTTOKEN2 (testnurse2)')
  
  await c.close()
})()
