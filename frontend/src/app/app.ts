import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

interface ApiHealth {
  status: string;
  service: string;
}

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly apiStatus = signal('Checking API...');

  ngOnInit(): void {
    this.http.get<ApiHealth>('/api/health').subscribe({
      next: (health) => this.apiStatus.set(`Connected to ${health.service}: ${health.status}`),
      error: () => this.apiStatus.set('API unavailable. Start it with npm run start:api.')
    });
  }
}
