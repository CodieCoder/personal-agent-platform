Feature: Execution history filtering

  @executions @history @workspace
  Scenario: User filters execution history by workspace
    Given I navigate to "/executions?workspaceId=workspace_qa_alpha&capabilityId=capability.echo&status=completed&from=2026-07-01&to=2026-07-01&page=1&pageSize=10"
    When I wait for the heading "Execution history"
    Then the text "exec_qa_history_visible" should exist
    And the text "1 total" should exist

  @executions @history @trace
  Scenario: User opens a filtered execution trace
    Given I navigate to "/executions?workspaceId=workspace_qa_alpha&capabilityId=capability.echo&status=completed&from=2026-07-01&to=2026-07-01&page=1&pageSize=10"
    When I click the link "Open execution exec_qa_history_visible"
    And I wait for the heading "Execution detail"
    Then css:.page-header should contain text "completed"
    And the text "workspace_qa_alpha" should exist
    And css:.trace-list should contain text "finalize execution"

  @executions @history @isolation
  Scenario: User sees only the selected workspace records
    Given I navigate to "/executions?workspaceId=workspace_qa_beta&capabilityId=capability.echo&status=completed&from=2026-07-01&to=2026-07-01&page=1&pageSize=10"
    When I wait for the heading "Execution history"
    Then the text "exec_qa_history_hidden" should exist
    And the text "exec_qa_history_visible" should not be visible
    And the text "1 total" should exist
