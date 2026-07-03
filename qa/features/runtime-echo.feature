Feature: Runtime echo execution

  @runtime @echo @smoke
  Scenario: User runs the echo capability and sees the echoed result
    Given I navigate to "/"
    When I wait for css:[data-runtime-ready='true']
    And I type "Hello Personal Agent" into the field "Message"
    And I click the button "Run echo"
    And I wait for css:.result-success
    Then css:.result-success should contain text "Completed"
    And css:.result-success should contain text "Hello Personal Agent"

  @runtime @echo @trace
  Scenario: User opens the latest echo execution and sees its trace
    Given I navigate to "/"
    When I wait for the link "Latest execution detail"
    And I click the link "Latest execution detail"
    And I wait for the heading "Execution detail"
    Then I should see the heading "Execution detail"
    And css:.page-header should contain text "completed"
    And css:.trace-list should contain text "validate input"
    And css:.trace-list should contain text "finalize execution"
