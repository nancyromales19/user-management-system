import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { AccountService } from '@app/_services';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
    private isRefreshing = false;

    constructor(private accountService: AccountService) { }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        return next.handle(request).pipe(
            catchError(err => {
                if (err.status === 401 && !request.url.includes('/refresh-token') && this.accountService.accountValue) {
                    if (!this.isRefreshing) {
                        this.isRefreshing = true;
                        return this.accountService.refreshToken().pipe(
                            switchMap(() => {
                                this.isRefreshing = false;
                                // Retry the original request with the new token
                                return next.handle(request);
                            }),
                            catchError(refreshError => {
                                this.isRefreshing = false;
                                // If refresh token fails, logout
                                this.accountService.logout();
                                return throwError(refreshError);
                            })
                        );
                    }
                }

                if ([401, 403].includes(err.status) && this.accountService.accountValue) {
                    // auto logout if 401 or 403 response returned from api
                    this.accountService.logout();
                }

                const error = err.error?.message || err.statusText;
                console.error(err);
                return throwError(error);
            })
        );
    }
}