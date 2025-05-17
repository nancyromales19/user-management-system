import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, finalize } from 'rxjs/operators';

import { environment } from '@environments/environment';
import { Account } from '@app/_models';

const baseUrl = `${environment.apiUrl}/accounts`;

@Injectable({ providedIn: 'root' })
export class AccountService {
    private accountSubject: BehaviorSubject<Account>;
    public account: Observable<Account>;

    constructor(
        private router: Router,
        private http: HttpClient
    ) {
        // Load account from local storage if available
        this.accountSubject = new BehaviorSubject<Account>(JSON.parse(localStorage.getItem('account')));
        this.account = this.accountSubject.asObservable();
    }

    public get accountValue(): Account {
        return this.accountSubject.value;
    }

    login(email: string, password: string) {
        return this.http.post<any>(`${baseUrl}/authenticate`, { email, password }, { withCredentials: true })
            .pipe(map(account => {
                // Store the account (with jwtToken) in local storage
                localStorage.setItem('account', JSON.stringify(account));
                this.accountSubject.next(account);
                this.startRefreshTokenTimer();
                return account;
            }));
    }

    logout() {
        // Clean up local state first
        this.stopRefreshTokenTimer();
        this.accountSubject.next(null);
        localStorage.removeItem('account');

        // Attempt to revoke the token, but don't wait for it
        const refreshToken = this.getRefreshTokenFromCookie();
        if (refreshToken) {
            this.http.post<any>(`${baseUrl}/revoke-token`, { token: refreshToken }, { withCredentials: true })
                .subscribe({
                    error: (error) => {
                        console.error('Error revoking token:', error);
                    }
                });
        }

        // Navigate to login page
        this.router.navigate(['/account/login']);
    }

    // Helper to get refresh token from cookie
    private getRefreshTokenFromCookie(): string | null {
        const match = document.cookie.match(new RegExp('(^| )refreshToken=([^;]+)'));
        return match ? match[2] : null;
    }

    refreshToken() {
        return this.http.post<any>(`${baseUrl}/refresh-token`, {}, { withCredentials: true })
            .pipe(map(account => {
                // Store the account (with jwtToken) in local storage
                localStorage.setItem('account', JSON.stringify(account));
                this.accountSubject.next(account);
                this.startRefreshTokenTimer();
                return account;
            }));
    }

    register(account: Account) {
        return this.http.post(`${baseUrl}/register`, account);
    }

    verifyEmail(token: string) {
        return this.http.post(`${baseUrl}/verify-email`, { token });
    }

    forgotPassword(email: string) {
        return this.http.post(`${baseUrl}/forgot-password`, { email });
    }

    validateResetToken(token: string) {
        return this.http.post(`${baseUrl}/validate-reset-token`, { token });
    }

    resetPassword(token: string, password: string, confirmPassword: string) {
        return this.http.post(`${baseUrl}/reset-password`, { token, password, confirmPassword });
    }

    getAll() {
        return this.http.get<Account[]>(baseUrl, { withCredentials: true });
    }

    getById(id: string) {
        return this.http.get<Account>(`${baseUrl}/${id}`, { withCredentials: true });
    }

    create(params: any) {
        return this.http.post(baseUrl, params, { withCredentials: true });
    }

    update(id, params) {
        return this.http.put(`${baseUrl}/${id}`, params, { withCredentials: true })
            .pipe(map((account: any) => {
                // update the current account if it was updated
                if (account.id === this.accountValue.id) {
                    // publish updated account to subscribers
                    account = { ...this.accountValue, ...account };
                    this.accountSubject.next(account);
                }
                return account;
            }));
    }    

    delete(id: string) {
        return this.http.delete(`${baseUrl}/${id}`, { withCredentials: true })
            .pipe(finalize(() => {
                // auto logout if the logged in account was deleted
                if (id === this.accountValue.id) 
                    this.logout();
            }));
    }

    deactivateAccount(id: number) {
        return this.http.put(`${baseUrl}/accounts/${id}/deactivate`, {}, { withCredentials: true });
    }
    
    activateAccount(id: number) {
        return this.http.put(`${baseUrl}/accounts/${id}/activate`, {}, { withCredentials: true });
    }
      

    // helper methods

    private refreshTokenTimeout;

    private startRefreshTokenTimer() {
        // parse json object from base64 encoded jwt token
        const jwtToken = JSON.parse(atob(this.accountValue.jwtToken.split('.')[1]));

        // set a timeout to refresh the token a minute before it expires
        const expires = new Date(jwtToken.exp * 1000);
        const timeout = expires.getTime() - Date.now() - (60 * 1000);
        this.refreshTokenTimeout = setTimeout(() => {
            this.refreshToken().subscribe({
                error: () => {
                    // If refresh token fails, logout
                    this.logout();
                }
            });
        }, timeout);
    }

    private stopRefreshTokenTimer() {
        clearTimeout(this.refreshTokenTimeout);
    }
}