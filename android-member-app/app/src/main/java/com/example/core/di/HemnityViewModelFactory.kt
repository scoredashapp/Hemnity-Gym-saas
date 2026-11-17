package com.example.core.di

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.example.ui.attendance.AttendanceViewModel
import com.example.ui.auth.AuthViewModel
import com.example.ui.dashboard.DashboardViewModel
import com.example.ui.gyms.GymsViewModel
import com.example.ui.idcard.IdCardViewModel
import com.example.ui.membership.MembershipViewModel
import com.example.ui.notifications.NotificationsViewModel
import com.example.ui.payments.PaymentsViewModel
import com.example.ui.profile.ProfileViewModel

class HemnityViewModelFactory(
    private val container: AppContainer,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return when {
            modelClass.isAssignableFrom(AuthViewModel::class.java) ->
                AuthViewModel(container.authRepository) as T
            modelClass.isAssignableFrom(DashboardViewModel::class.java) ->
                DashboardViewModel(container.memberRepository) as T
            modelClass.isAssignableFrom(GymsViewModel::class.java) ->
                GymsViewModel(container.memberRepository) as T
            modelClass.isAssignableFrom(MembershipViewModel::class.java) ->
                MembershipViewModel(container.memberRepository) as T
            modelClass.isAssignableFrom(AttendanceViewModel::class.java) ->
                AttendanceViewModel(container.memberRepository) as T
            modelClass.isAssignableFrom(IdCardViewModel::class.java) ->
                IdCardViewModel(container.memberRepository) as T
            modelClass.isAssignableFrom(PaymentsViewModel::class.java) ->
                PaymentsViewModel(container.memberRepository) as T
            modelClass.isAssignableFrom(ProfileViewModel::class.java) ->
                ProfileViewModel(
                    memberRepository = container.memberRepository,
                    authRepository = container.authRepository,
                    preferencesRepository = container.preferencesRepository,
                ) as T
            modelClass.isAssignableFrom(NotificationsViewModel::class.java) ->
                NotificationsViewModel(container.memberRepository) as T
            else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
    }
}
