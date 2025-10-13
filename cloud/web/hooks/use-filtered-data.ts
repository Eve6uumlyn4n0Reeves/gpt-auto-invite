import { useMemo } from 'react'
import { useAdminContext } from '@/store/admin-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

export const useFilteredData = () => {
  const { state } = useAdminContext()
  const {
    users,
    codes,
    searchTerm,
    filterStatus,
    sortBy,
    sortOrder,
    codesStatusMother,
    codesStatusTeam,
    codesStatusBatch,
  } = state

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300)

  // Get unique filter values
  const uniqueMothers = useMemo(() => {
    const s = new Set<string>()
    codes.forEach((c) => c.mother_name && s.add(c.mother_name))
    return Array.from(s)
  }, [codes])

  const uniqueTeams = useMemo(() => {
    const s = new Set<string>()
    codes.forEach((c) => (c.team_name || c.team_id) && s.add(c.team_name || (c.team_id as string)))
    return Array.from(s)
  }, [codes])

  const uniqueBatches = useMemo(() => {
    const s = new Set<string>()
    codes.forEach((c) => c.batch_id && s.add(c.batch_id))
    return Array.from(s)
  }, [codes])

  // Filter users
  const filteredUsers = useMemo(() => {
    const filtered = users.filter((user) => {
      const matchesSearch =
        debouncedSearchTerm === '' ||
        user.email.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        user.code_used?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        user.team_name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())

      const matchesStatus = filterStatus === 'all' || user.status === filterStatus

      return matchesSearch && matchesStatus
    })

    return filtered.sort((a, b) => {
      const aVal = a[sortBy as keyof typeof a] || ''
      const bVal = b[sortBy as keyof typeof b] || ''
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [users, debouncedSearchTerm, filterStatus, sortBy, sortOrder])

  // Filter codes
  const filteredCodes = useMemo(() => {
    const filtered = codes.filter((code) => {
      const matchesSearch =
        debouncedSearchTerm === '' ||
        code.code.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        code.batch_id?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        code.used_by?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())

      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'used' && code.is_used) ||
        (filterStatus === 'unused' && !code.is_used)

      return matchesSearch && matchesStatus
    })

    return filtered.sort((a, b) => {
      const aVal = a[sortBy as keyof typeof a] || ''
      const bVal = b[sortBy as keyof typeof b] || ''
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [codes, debouncedSearchTerm, filterStatus, sortBy, sortOrder])

  // Filter codes with additional status filters
  const filteredCodesStatus = useMemo(() => {
    return filteredCodes.filter((c) => {
      const motherOk = !codesStatusMother || c.mother_name === codesStatusMother
      const teamOk = !codesStatusTeam || c.team_name === codesStatusTeam || c.team_id === codesStatusTeam
      const batchOk = !codesStatusBatch || c.batch_id === codesStatusBatch
      return motherOk && teamOk && batchOk
    })
  }, [filteredCodes, codesStatusMother, codesStatusTeam, codesStatusBatch])

  return {
    filteredUsers,
    filteredCodes,
    filteredCodesStatus,
    uniqueMothers,
    uniqueTeams,
    uniqueBatches,
  }
}
