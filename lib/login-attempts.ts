import {database} from "@/db/postgres";

const MAX_ATTEMPTS=3;
const COOLDOWN_MINUTES=15;

export async function loginAttemptStatus(key:string){
  const rows=await database().query("SELECT locked_until FROM login_attempt_limits WHERE key=$1",[key]) as Array<{locked_until:string|null}>;
  const until=rows[0]?.locked_until ? Date.parse(rows[0].locked_until) : 0;
  return {blocked:until>Date.now(),seconds:Math.max(0,Math.ceil((until-Date.now())/1000))};
}
export async function failedLoginAttempt(key:string){
  const rows=await database().query(
    `INSERT INTO login_attempt_limits(key,failures,started_at,locked_until)
     VALUES($1,1,NOW(),NULL)
     ON CONFLICT(key) DO UPDATE SET
       failures=CASE WHEN login_attempt_limits.started_at<NOW()-INTERVAL '15 minutes' THEN 1 ELSE login_attempt_limits.failures+1 END,
       started_at=CASE WHEN login_attempt_limits.started_at<NOW()-INTERVAL '15 minutes' THEN NOW() ELSE login_attempt_limits.started_at END,
       locked_until=CASE WHEN login_attempt_limits.started_at<NOW()-INTERVAL '15 minutes' THEN NULL WHEN login_attempt_limits.failures>=2 THEN NOW()+INTERVAL '15 minutes' ELSE NULL END
     RETURNING failures,locked_until`,[key]) as Array<{failures:number;locked_until:string|null}>;
  return {remaining:Math.max(0,MAX_ATTEMPTS-Number(rows[0]?.failures||0)),locked:Boolean(rows[0]?.locked_until)};
}
export async function resetLoginAttempts(key:string){
  await database().query("DELETE FROM login_attempt_limits WHERE key=$1",[key]);
}
export {COOLDOWN_MINUTES,MAX_ATTEMPTS};
