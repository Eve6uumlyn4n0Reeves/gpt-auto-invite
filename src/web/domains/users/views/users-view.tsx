'use client'

import { UsersSection } from '@/components/admin/sections/users-section'
import { useUsersViewModel } from '@/domains/users/view-models/use-users-view-model'

export function UsersView() {
  const {
    usersLoading,
    filteredUsers,
    userTableColumns,
    containerHeight,
    itemHeight,
    selectedUsers,
    batchOperation,
    setBatchOperation,
    batchLoading,
    clearSelection,
    supportedBatchActions,
    executeBatch,
    executeBatchAsync,
    refreshUsers,
    handleUserRowAction,
    usersPage,
    usersPageSize,
    usersTotal,
    handlePageChange,
    handlePageSizeChange,
  } = useUsersViewModel()

  return (
    <UsersSection
      loading={usersLoading}
      filteredUsers={filteredUsers}
      userTableColumns={userTableColumns}
      containerHeight={containerHeight}
      itemHeight={itemHeight}
      selectedUsers={selectedUsers}
      batchOperation={batchOperation}
      supportedBatchActions={supportedBatchActions}
      batchLoading={batchLoading}
      onClearCache={refreshUsers}
      onRefresh={refreshUsers}
      onBatchOperationChange={setBatchOperation}
      onClearSelection={clearSelection}
      onExecuteBatch={executeBatch}
      onExecuteBatchAsync={executeBatchAsync}
      onRowAction={handleUserRowAction}
      page={usersPage}
      pageSize={usersPageSize}
      total={usersTotal}
      onPageChange={handlePageChange}
      onPageSizeChange={handlePageSizeChange}
    />
  )
}
