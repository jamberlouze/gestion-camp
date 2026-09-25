import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './index.css'
import { FournisseurAuth } from './shell/auth'

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <FournisseurAuth>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </FournisseurAuth>
    </QueryClientProvider>
  </StrictMode>,
)
