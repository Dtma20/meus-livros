export interface DashboardAuthorView {
  id: string
  name: string
  slug: string
}

export interface DashboardWorkView {
  id: string
  title: string
  slug: string
  first_published_year: number | null
  cover_url: string | null
  authors: DashboardAuthorView[]
}

export interface DashboardInProgressBook {
  id: string
  work: DashboardWorkView
  started_on: string | null
  updated_at: Date
  pages_read: number
  total_pages: number | null
  current_page: number
  percentage: number | null
}

export interface DashboardCompletedBook {
  id: string
  work: DashboardWorkView
  rating: number | null
  review_excerpt: string | null
  finished_on: string
  finished_precision: 'dia' | 'mes' | 'ano'
  created_at: Date
}

export interface DashboardResponse {
  inProgress: DashboardInProgressBook[]
  completed: DashboardCompletedBook[]
}
