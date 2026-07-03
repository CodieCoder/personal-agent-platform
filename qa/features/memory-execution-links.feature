Feature: Memory execution links

  @memory @episodes @trace
  Scenario: User filters to an execution-linked episodic memory record
    Given I navigate to "/memory/episodes?workspaceId=workspace_qa_alpha&executionId=exec_qa_history_visible&status=active"
    When I wait for the heading "Episodic memory"
    Then css:.entity-list should contain text "qa.execution_linked"
    And css:.entity-list should contain text "exec_qa_history_visible"

  @memory @episodes @trace
  Scenario: User follows an episodic memory execution link
    Given I navigate to "/memory/episodes?workspaceId=workspace_qa_alpha&executionId=exec_qa_history_visible&status=active"
    When I wait for the heading "Episodic memory"
    And I wait for the link "Open memory memory_qa_episode"
    And I click the link "Open memory memory_qa_episode"
    And I wait for the heading "qa.execution_linked"
    And I click the link "exec_qa_history_visible"
    And I wait for the heading "Execution detail"
    Then css:.trace-list should contain text "finalize execution"
