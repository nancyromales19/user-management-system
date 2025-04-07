import { Injectable } from '@angular/core';
import { HttpRequest, HttpResponse, HttpHandler, HttpEvent, HttpInterceptor, HTTP_INTERCEPTORS, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { delay, materialize, dematerialize } from 'rxjs/operators';

import { AlertService } from '@app/_services';
import { Role } from '@app/_models';

// array in local storage for accounts
const accountsKey = 'angular-10-signup-verification-boilerplate-accounts';
let accounts = JSON.parse(localStorage.getItem(accountsKey)) || [];

@Injectable()
export class FakeBackendInterceptor implements HttpInterceptor {
    constructor(private alertService: AlertService) { }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        const { url, method, headers, body } = request;
        const alertService = this.alertService;

        return handleRoute();
    }
}

function handleRoute() {
    switch (true) {
        case url.endsWith('/accounts/authenticate') && method === 'POST':
            return authenticate();
        case url.endsWith('/accounts/refresh-token') && method === 'POST':
            return refreshToken();
        case url.endsWith('/accounts/revoke-token') && method === 'POST':
            return revokeToken();
        case url.endsWith('/accounts/register') && method === 'POST':
            return register();
        case url.endsWith('/accounts/verify-email') && method === 'POST':
            return verifyEmail();
        case url.endsWith('/accounts/forgot-password') && method === 'POST':
            return forgotPassword();
        case url.endsWith('/accounts/validate-reset-token') && method === 'POST':
            return validateResetToken();
        case url.endsWith('/accounts/reset-password') && method === 'POST':
            return resetPassword();
        case url.endsWith('/accounts') && method === 'GET':
            return getAccounts();
        case url.match(/\/accounts\/\d+$/) && method === 'GET':
            return getAccountById();
        case url.endsWith('/accounts') && method === 'POST':
            return createAccount();
        case url.match(/\/accounts\/\d+$/) && method === 'PUT':
            return updateAccount();
        case url.match(/\/accounts\/\d+$/) && method === 'DELETE':
            return deleteAccount();
        default:
            // pass through any requests not handled above
            return next.handle(request);
    }
}

function authenticate() {
    const { email, password } = body;
    const account = accounts.find(x => x.email === email && x.password === password && x.isVerified);
    if (!account) return error('Email or password is incorrect');

    // add refresh token to account
    account.refreshTokens.push(generateRefreshToken());
    localStorage.setItem(accountsKey, JSON.stringify(accounts));

    return ok({
        ...basicDetails(account),
        jwtToken: generateJwtToken(account)
    });
}

function refreshToken() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return unauthorized();

    const account = accounts.find(x => x.refreshTokens.includes(refreshToken));
    if (!account) return unauthorized();

    // replace old refresh token with a new one and save
    account.refreshTokens = account.refreshTokens.filter(x => x !== refreshToken);
    account.refreshTokens.push(generateRefreshToken());
    localStorage.setItem(accountsKey, JSON.stringify(accounts));

    return ok({
        ...basicDetails(account),
        jwtToken: generateJwtToken(account)
    });
}

function revokeToken() {
    if (!isAuthenticated()) return unauthorized();

    const refreshToken = getRefreshToken();
    const account = accounts.find(x => x.refreshTokens.includes(refreshToken));

    // revoke token and save
    account.refreshTokens = account.refreshTokens.filter(x => x !== refreshToken);
    localStorage.setItem(accountsKey, JSON.stringify(accounts));

    return ok();
}

function register() {
    const account = body;

    if (accounts.find(x => x.email === account.email)) {
        // send already registered error in fake backend
        alertService.error('Email "' + account.email + '" is already registered', { keepAfterRouteChange: true });
        return error('Email "' + account.email + '" is already registered');

        // NOTE: real api should return http response with error code in this case
        // return httpResponse.error({ message: 'Email "' + account.email + '" is already registered' });
    }

    // add in a fake delay to simulate real api call
    return ok({
        message: 'Please check your email for verification instructions',
        autoClose: true
    });

    // add new account id if it doesn't have one
    if (!account.id) {
        account.id = newAccountId();
    }
    // first registered account is an admin
    const isAdmin = accounts.length === 0;
    account.role = isAdmin ? Role.Admin : Role.User;

    // fields required for verify email
    account.verificationToken = randomToken();
    account.verificationTokenCreated = new Date();
    account.verificationTokenExpires = new Date(Date.now() + 7*24*60*60*1000); // add 7 days
    account.isVerified = false;
    account.refreshToken = [];
    account.confirmPassword = undefined;

    accounts.push(account);
    localStorage.setItem(accountsKey, JSON.stringify(accounts));

    // display verification email in alert
    setTimeout(() => {
        alertService.info('<h4>Please check your email to verify your email address</h4>'
            + '<p><a href="' + location.origin + '/account/verify-email?token=' + account.verificationToken + '">Verify Email</a></p>',
            { autoClose: false });
    }, 1000);

    return ok();
}

function verifyEmail() {
    const { token } = body;
    const account = accounts.find(x => x.verificationToken === token && x.verificationTokenExpires > Date.now());

    if (!account) return error('Verification failed');

    // set account to verified and save
    account.isVerified = true;
    localStorage.setItem(accountsKey, JSON.stringify(accounts));

    return ok();
}

function forgotPassword() {
    const { email } = body;
    const account = accounts.find(x => x.email === email);

    // always return ok() response to prevent email enumeration
    if (!account) return ok();

    // create reset token that expires after 24 hours
    account.resetToken = randomToken();
    account.resetTokenExpires = new Date(Date.now() + 24*60*60*1000).toISOString();
    localStorage.setItem(accountsKey, JSON.stringify(accounts));

    // display password reset email in alert
    setTimeout(() => {
        const resetUrl = `${location.origin}/account/reset-password?token=${account.resetToken}`;
        alertService.info(`
            <h4>Reset Password Email</h4>
            <p>Please click the below link to reset your password, the link will be valid for 1 day:</p>
            <a href="${resetUrl}">${resetUrl}</a>
            <div><b>NOTE: </b>The fake backend displayed this email so you can test without an api. A real backend would send a real email.</div>
        `, { autoClose: false });
    }, 1000);

    return ok();
}

function validateResetToken() {
    const { token } = body;
    const account = accounts.find(x => x.resetToken === token && new Date() < new Date(x.resetTokenExpires));

    if (!account) return error('Invalid token');

    return ok();
}

function resetPassword() {
    const { token, password } = body;
    const account = accounts.find(x => x.resetToken === token && new Date() < new Date(x.resetTokenExpires));

    if (!account) return error('Invalid token');

    // update password and remove reset token
    account.password = password;
    account.isVerified = true;
    delete account.resetToken;
    delete account.resetTokenExpires;
    localStorage.setItem(accountsKey, JSON.stringify(accounts));

    return ok();
}

function getAccounts() {
    if (!isAuthenticated()) return unauthorized();
    return ok(accounts.map(x => basicDetails(x)));
}

function getAccountById() {
    if (!isAuthenticated()) return unauthorized();

    let account = accounts.find(x => x.id === idFromUrl());

    // user accounts can get own profile and admin accounts can get all profiles
    if (account.id !== currentAccount().id && !isAuthorized(Role.Admin)) {
        return unauthorized();
    }

    return ok(basicDetails(account));
}

function createAccount() {
    if (!isAuthorized(Role.Admin)) return unauthorized();

    const account = body;

    if (accounts.find(x => x.email === account.email)) {
        return error(`Email ${account.email} is already registered`);
    }

    // assign account id and a few other properties then save
    account.id = newAccountId();
    account.dateCreated = new Date().toISOString();
    account.isVerified = true;
    account.refreshTokens = [];
    delete account.confirmPassword;
    accounts.push(account);
    localStorage.setItem(accountsKey, JSON.stringify(accounts));

    return ok();
}

function updateAccount() {
    if (!isAuthenticated()) return unauthorized();

    let params = body;
    let account = accounts.find(x => x.id === idFromUrl());

    // user accounts can update own profile and admin accounts can update all profiles
    if (account.id !== currentAccount().id && !isAuthorized(Role.Admin)) {
        return unauthorized();
    }

    // only update password if included
    if (params.password) {
        delete params.password;
    }

    // don't save confirm password
    delete params.confirmPassword;

    // update and save account
    Object.assign(account, params);
    localStorage.setItem(accountsKey, JSON.stringify(accounts));

    return ok(basicDetails(account));
}

function deleteAccount() {
    if (!isAuthenticated()) return unauthorized();

    let account = accounts.find(x => x.id === idFromUrl());

    // user accounts can delete own account and admin accounts can delete any account
    if (account.id !== currentAccount().id && !isAuthorized(Role.Admin)) {
        return unauthorized();
    }

    // delete account then save
    accounts = accounts.filter(x => x.id !== idFromUrl());
    localStorage.setItem(accountsKey, JSON.stringify(accounts));

    return ok();
}

// helper functions

function ok(body) {
    return of(new HttpResponse({ status: 200, body }))
        .pipe(delay(500)); // simulate server api call
}

function error(message) {
    return throwError({ error: { message } })
        .pipe(materialize(), delay(500), dematerialize()); // simulate server api call
}

function unauthorized() {
    return throwError({ status: 401, error: { message: 'Unauthorized' } })
        .pipe(materialize(), delay(500), dematerialize()); // simulate server api call
}

function basicDetails(account) {
    const { id, title, firstName, lastName, email, role, dateCreated, isVerified } = account;
    return { id, title, firstName, lastName, email, role, dateCreated, isVerified };
}

function generateJwtToken(account) {
    // create token that expires in 15 minutes
    return jwt.sign({ sub: account.id, id: account.id, role: account.role }, 'secret', { expiresIn: '15m' });
}

function generateRefreshToken() {
    return randomToken();
}

function randomToken() {
    return Math.random().toString(36).substring(2);
}

function idFromUrl() {
    const urlParts = url.split('/');
    return parseInt(urlParts[urlParts.length - 1]);
}

function newAccountId() {
    return accounts.length ? Math.max(...accounts.map(x => x.id)) + 1 : 1;
}

function currentAccount() {
    // check if jwt token is in auth header
    const authHeader = headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer fake-jwt-token')) return;

    // check if token is expired
    const jwtToken = JSON.parse(atob(authHeader.split('.')[1]));
    const tokenExpired = new Date(jwtToken.exp * 1000);
    if (tokenExpired < new Date()) return;

    const account = accounts.find(x => x.id === jwtToken.id);
    return account;
}

function generateJwtToken(account) {
    // create token that expires in 15 minutes
    const tokenPayload = {
        exp: Math.round(new Date(Date.now() + 15*60*1000).getTime() / 1000),
        id: account.id
    };
    return 'fake-jwt-token.' + btoa(JSON.stringify(tokenPayload));
}

function generateRefreshToken() {
    const token = new Date().getTime().toString();

    // add token cookie that expires in 7 days
    const expires = new Date(Date.now() + 7*24*60*60*1000).toUTCString();
    document.cookie = `fakeRefreshToken=${token}; expires=${expires}; path=/`;

    return token;
}

function getRefreshToken() {
    // get token from cookie
    return document.cookie.split(';').find(x => x.includes('fakeRefreshToken'))?.split('=')[1];
}

export let fakeBackendProvider = {
    // use fake backend in place of http service for backend-less development
    provide: HTTP_INTERCEPTORS,
    useClass: FakeBackendInterceptor,
    multi: true
};