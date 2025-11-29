import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface OrganizationSelectorProps {
  onCreateNew: () => void
}

export default function OrganizationSelector({ onCreateNew }: OrganizationSelectorProps) {
  const { organization, organizations, switchOrganization } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSwitch = async (orgId: string) => {
    if (orgId === organization?.id) {
      setIsOpen(false)
      return
    }

    setIsLoading(true)
    try {
      await switchOrganization(orgId)
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to switch organization:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
      >
        <div className="flex items-center gap-2 truncate">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            {organization?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <span className="truncate font-medium">
            {organization?.name || 'Select Organization'}
          </span>
        </div>
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-border bg-card shadow-lg">
          <div className="max-h-64 overflow-y-auto py-1">
            {organizations.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No organizations found
              </div>
            ) : (
              organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSwitch(org.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent ${
                    org.id === organization?.id ? 'bg-accent' : ''
                  }`}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/20 text-xs font-bold text-primary">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate">{org.name}</span>
                  {org.id === organization?.id && (
                    <svg
                      className="ml-auto h-4 w-4 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border">
            <button
              onClick={() => {
                setIsOpen(false)
                onCreateNew()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-accent"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create new organization
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

