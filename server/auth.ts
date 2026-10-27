import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor, captcha } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { queueMail } from './mail';

export function authFor(env:Env,ctx:Pick<ExecutionContext,'waitUntil'>){
  if(!env.BETTER_AUTH_SECRET||env.BETTER_AUTH_SECRET.length<32)throw new Error('Auth is not configured');
  return betterAuth({
    appName:'Oasis',baseURL:env.APP_ORIGIN,basePath:'/api/auth',secret:env.BETTER_AUTH_SECRET,
    trustedOrigins:[env.APP_ORIGIN],database:drizzleAdapter(drizzle(env.DB),{provider:'sqlite',schema}),
    socialProviders:env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET?{google:{clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,prompt:'select_account',accessType:'online'}}:{},
    account:{encryptOAuthTokens:true,accountLinking:{enabled:false}},
    emailAndPassword:{enabled:true,requireEmailVerification:true,autoSignIn:false,minPasswordLength:12,maxPasswordLength:128,revokeSessionsOnPasswordReset:true,
      sendResetPassword:async({user,url})=>{ctx.waitUntil(queueMail(env,{to:user.email,subject:'Oasis · redefinir sua senha',text:`Recebemos uma solicitação de redefinição de senha. Use este link em até 15 minutos:\n${url}\n\nSe não foi você, ignore esta mensagem.`}));},
      resetPasswordTokenExpiresIn:900,
    },
    emailVerification:{sendOnSignUp:true,sendOnSignIn:false,autoSignInAfterVerification:false,expiresIn:900,
      sendVerificationEmail:async({user,url})=>{ctx.waitUntil(queueMail(env,{to:user.email,subject:'Confirme seu e-mail na Oasis',text:`Boas-vindas à Oasis. Confirme seu e-mail para liberar sua conta:\n${url}\n\nO link expira em 15 minutos. Se não solicitou o cadastro, ignore esta mensagem.`}));},
    },
    session:{expiresIn:60*60*24,updateAge:60*60,freshAge:60*10,cookieCache:{enabled:false}},
    advanced:{useSecureCookies:env.APP_ENV==='production',cookiePrefix:'oasis',defaultCookieAttributes:{httpOnly:true,sameSite:'lax',path:'/'},ipAddress:{ipAddressHeaders:['cf-connecting-ip']},database:{generateId:()=>crypto.randomUUID()}},
    rateLimit:{enabled:true,storage:'database',window:60,max:40,customRules:{'/sign-up/email':{window:300,max:5},'/sign-in/email':{window:60,max:5},'/send-verification-email':{window:300,max:3},'/request-password-reset':{window:300,max:3},'/two-factor/*':{window:60,max:5}}},
    plugins:[twoFactor({issuer:'Oasis'}),...(env.TURNSTILE_SECRET_KEY?[captcha({provider:'cloudflare-turnstile',secretKey:env.TURNSTILE_SECRET_KEY,allowedHostnames:[new URL(env.APP_ORIGIN).hostname],expectedAction:'oasis-auth',endpoints:['/sign-up/email','/sign-in/email','/request-password-reset','/send-verification-email']})]:[])],
    logger:{level:'error',log:()=>{console.error(JSON.stringify({event:'authentication_error'}));}},
  });
}
